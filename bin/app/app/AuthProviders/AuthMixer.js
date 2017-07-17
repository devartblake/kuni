const { ipcMain, BrowserWindow } = require('electron')
const { AUTH_MIXER, AUTH_MIXER_COMPLETE, AUTH_MIXER_ERROR } = require('../../shared/ipcEvents')
const url = require('url')
const querystring = require('querystring')

class AuthMixer {
  /* ****************************************************************************/
  // Lifecycle
  /* ****************************************************************************/

  constructor () {
    ipcMain.on(AUTH_MIXER, (evt, body) => {
      this.handleAuthMixer(evt, body)
    })
  }

  /* ****************************************************************************/
  // Authentication
  /* ****************************************************************************/

  /**
  * Generates the authentication url for our secrets, scopes and access type
  * @param credentials: the credentials to use
  * @return the url that can be used to authenticate with goog
  */
  generateMixerAuthenticationURL (credentials) {
    // MIXER_AUTH_RETURN_URL should really be 'urn:ietf:wg:oauth:2.0:oob' but because
    // of what I think is https://github.com/electron/electron/issues/3471 this doesn't work
    // however the remote url does. We'll use this but kill the redirect request before it
    // heads off to the web
    const query = querystring.stringify({
      client_id: credentials.MIXER_CLIENT_ID,
      redirect_uri: credentials.MIXER_AUTH_RETURN_URL,
      response_type: 'code',
      scope: [
        'offline_access',
        'User.Read',
        'Mail.Read',
        'Files.Read'
      ].join(' ')
    })
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${query}`
  }

  /**
  * Gets the authorization code by prompting the user to sign in
  * @param credentials: the credentials to use
  * @param partitionId: the id of the partition
  * @return promise
  */
  promptUserToGetAuthorizationCode (credentials, partitionId) {
    return new Promise((resolve, reject) => {
      const oauthWin = new BrowserWindow({
        useContentSize: true,
        center: true,
        show: true,
        resizable: false,
        alwaysOnTop: true,
        standardWindow: true,
        autoHideMenuBar: true,
        title: 'Mixer',
        height: 750,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          partition: partitionId.indexOf('persist:') === 0 ? partitionId : 'persist:' + partitionId
        }
      })

      oauthWin.loadURL(this.generateMixerAuthenticationURL(credentials))

      oauthWin.on('closed', () => {
        reject(new Error('User closed the window'))
      })

      // Listen for changes
      oauthWin.webContents.on('did-get-redirect-request', (evt, prevUrl, nextUrl) => {
        if (nextUrl.indexOf(credentials.MIXER_AUTH_RETURN_URL) === 0) {
          evt.preventDefault()
          const purl = url.parse(nextUrl, true)
          if (purl.query.code) {
            oauthWin.removeAllListeners('closed')
            oauthWin.close()
            resolve(purl.query.code)
          } else if (purl.query.error) {
            oauthWin.removeAllListeners('closed')
            oauthWin.close()

            if (purl.query.error === 'access_denied') {
              reject(new Error(purl.query.error_description))
            } else {
              reject(new Error(`${purl.query.error}:${purl.query.error_subcode}:${purl.query.error_description}`))
            }
          }
        }
      })
    })
  }

  /* ****************************************************************************/
  // Request Handlers
  /* ****************************************************************************/

  /**
  * Handles the oauth request
  * @param evt: the incoming event
  * @param body: the body sent to us
  */
  handleAuthMixer (evt, body) {
    Promise.resolve()
      .then(() => this.promptUserToGetAuthorizationCode(body.credentials, body.id))
      .then((temporaryCode) => {
        evt.sender.send(AUTH_MIXER_COMPLETE, {
          id: body.id,
          authMode: body.authMode,
          provisional: body.provisional,
          temporaryCode: temporaryCode,
          codeRedirectUri: body.credentials.MIXER_AUTH_RETURN_URL
        })
      }, (err) => {
        evt.sender.send(AUTH_MIXER_ERROR, {
          id: body.id,
          authMode: body.authMode,
          provisional: body.provisional,
          error: err,
          errorString: (err || {}).toString ? (err || {}).toString() : undefined,
          errorMessage: (err || {}).message ? (err || {}).message : undefined,
          errorStack: (err || {}).stack ? (err || {}).stack : undefined
        })
      })
  }
}

module.exports = AuthMixer