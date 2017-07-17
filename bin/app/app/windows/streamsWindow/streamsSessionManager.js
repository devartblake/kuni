const {session, dialog, app} = require('electron')
const uuid = require('uuid')
const fs = require('fs-extra')
const path = require('path')
const settingStore = require('../../stores/settingStore')
const streamStore = require('../../stores/streamStore')
const unusedFilename = require('unused-filename')
const pkg = require('../../../package.json')
const {
  ARTIFICIAL_COOKIE_PERSIST_WAIT,
  ARTIFICIAL_COOKIE_PERSIST_PERIOD
} = require('../../../shared/constants')
const StreamFactory = require('../../../shared/Models/Accounts/StreamFactory')
const CoreStream = require('../../../shared/Models/Accounts/CoreStream')
//const ContentExtensions = require('../../Extensions/Content')

class StreamsSessionManager {
  /* ****************************************************************************/
  // Lifecycle
  /* ****************************************************************************/

  /**
  * @param streamWindow: the stream window instance we're working for
  */
  constructor (streamWindow) {
    this.streamWindow = streamWindow
    this.downloadsInProgress = { }
    this.persistCookieThrottle = { }

    this.__managed__ = new Set()
  }

  /* ****************************************************************************/
  // Utils
  /* ****************************************************************************/

  /**
  * @param partition: the partition id
  * @return the stream model for the partition
  */
  getStreamFromPartition (partition) {
    return streamStore.getStreams(partition.replace('persist:', ''))
  }

  /* ****************************************************************************/
  // Setup & Auth
  /* ****************************************************************************/

  /**
  * Starts managing a session
  * @param parition the name of the partion to manage
  * @param streamType: the type of stream we're managing for
  */
  startManagingSession (partition, streamType) {
    if (this.__managed__.has(partition)) { return }

    const ses = session.fromPartition(partition)
    ses.setDownloadPath(app.getPath('downloads'))
    ses.on('will-download', this.handleDownload.bind(this))
    ses.setPermissionRequestHandler(this.handlePermissionRequest)
    ses.webRequest.onCompleted((evt) => this.handleRequestCompleted(evt, ses, partition))
    this.setupUserAgent(ses, partition, streamType)
    ContentExtensions.supportedProtocols.forEach((protocol) => {
      ses.protocol.registerStringProtocol(protocol, ContentExtensions.handleStringProtocolRequest.bind(ContentExtensions))
    })
    this.__managed__.add(partition)
  }

  /* ****************************************************************************/
  // UserAgent
  /* ****************************************************************************/

  /**
  * Sets up the user agent for each stream type
  * @param ses: the session object to update
  * @param partition: the partition the useragent is for
  * @param streamType: the type of stream this is
  */
  setupUserAgent (ses, partition, streamType) {
    const defaultUA = ses.getUserAgent()
      .replace( // Replace electron with our version of Kuni
        `Electron/${process.versions.electron}`,
        `${pkg.name.charAt(0).toUpperCase()}${pkg.name.slice(1)}/${pkg.version}`
      )

    // Handle accounts that have custom settings
    if (streamType === CoreStream.STREAM_TYPES.GENERIC) {
      const stream = this.getStreamFromPartition(partition)
      if (stream && stream.useCustomUserAgent && stream.customUserAgentString) {
        ses.setUserAgent(stream.customUserAgentString)
        return
      }
    }

    // Handle account types that have built in changes
    const streamClass = StreamFactory.getClass(streamType)
    if (streamClass && streamClass.userAgentChanges.length) {
      const ua = streamClass.userAgentChanges.reduce((acc, change) => {
        return acc.replace(change[0], change[1])
      }, defaultUA)
      ses.setUserAgent(ua)
      return
    }

    // Use the default UA
    ses.setUserAgent(defaultUA)
  }

  /* ****************************************************************************/
  // Permissions
  /* ****************************************************************************/

  /**
  * Handles a request for a permission from the client
  * @param webContents: the webcontents the request came from
  * @param permission: the permission name
  * @param fn: execute with response
  */
  handlePermissionRequest (webContents, permission, fn) {
    if (permission === 'notifications') {
      fn(false)
    } else {
      fn(true)
    }
  }

  /* ****************************************************************************/
  // Downloads
  /* ****************************************************************************/

  handleDownload (evt, item) {
    // Find out where to save the file
    let savePath
    if (!settingStore.os.alwaysAskDownloadLocation && settingStore.os.defaultDownloadLocation) {
      const folderLocation = settingStore.os.defaultDownloadLocation

      // Check the containing folder exists
      fs.ensureDirSync(folderLocation)
      savePath = unusedFilename.sync(path.join(folderLocation, item.getFilename()))
    } else {
      let pickedSavePath = dialog.showSaveDialog(this.streamWindow.window, {
        title: 'Download',
        defaultPath: path.join(app.getPath('downloads'), item.getFilename())
      })

      // There's a bit of a pickle here. Whilst asking the user where to save
      // they may have omitted the file extension. At the same time they may chosen
      // a filename that is already taken. We don't have any in-built ui to handle
      // this so the least destructive way is to find a filename that is not
      // in use and just save to there. In any case if the user picks a path and
      // that file does already exist we should remove it
      if (pickedSavePath) {
        // Remove existing file - save dialog prompts before allowing user to choose pre-existing name
        try { fs.removeSync(pickedSavePath) } catch (ex) { /* no-op */ }

        // User didn't add file extension
        if (!path.extname(pickedSavePath)) {
          pickedSavePath += path.extname(item.getFilename())
          pickedSavePath = unusedFilename.sync(pickedSavePath)
        }
        savePath = pickedSavePath
      }
    }

    // Check we still want to save
    if (!savePath) {
      item.cancel()
      return
    }

    // Set the save - will prevent dialog showing up
    const downloadPath = unusedFilename.sync(savePath + '.kunidownload') // just-in-case
    item.setSavePath(downloadPath)

    // Report the progress to the window to display it
    const totalBytes = item.getTotalBytes()
    const id = uuid.v4()
    item.on('updated', () => {
      this.updateDownloadProgress(id, item.getReceivedBytes(), totalBytes)
    })
    item.on('done', (e, state) => {
      // Event will get destroyed before move callback completes. If
      // you need any info from it grab it before calling fs.move
      if (state === 'completed') {
        setTimeout(() => { // Introduce a short wait incase the buffer is still flushing out
          fs.move(downloadPath, savePath, (err) => {
            this.downloadFinished(id)
            if (!err) { // This should never happen
              const saveName = path.basename(savePath)
              this.streamWindow.downloadCompleted(savePath, saveName)
            }
          })
        }, 500)
      } else {
        setTimeout(() => {  // Introduce a short wait incase the buffer is still flushing out
          // Tidy-up on failure
          try { fs.removeSync(downloadPath) } catch (ex) { /* no-op */ }
          this.downloadFinished(id)
        }, 500)
      }
    })
  }

  /* ****************************************************************************/
  // Download Progress
  /* ****************************************************************************/

  /**
  * Updates the progress bar in the dock
  */
  updateWindowProgressBar () {
    const all = Object.keys(this.downloadsInProgress).reduce((acc, id) => {
      acc.received += this.downloadsInProgress[id].received
      acc.total += this.downloadsInProgress[id].total
      return acc
    }, { received: 0, total: 0 })

    if (all.received === 0 && all.total === 0) {
      this.streamWindow.setProgressBar(-1)
    } else {
      this.streamWindow.setProgressBar(all.received / all.total)
    }
  }

  /**
  * Updates the progress on a download
  * @param id: the download id
  * @param received: the bytes received
  * @param total: the total bytes to download
  */
  updateDownloadProgress (id, received, total) {
    this.downloadsInProgress[id] = this.downloadsInProgress[id] || {}
    this.downloadsInProgress[id].received = received
    this.downloadsInProgress[id].total = total
    this.updateWindowProgressBar()
  }

  /**
  * Indicates that a download has finished
  * @param id: the download id
  */
  downloadFinished (id) {
    delete this.downloadsInProgress[id]
    this.updateWindowProgressBar()
  }

  /* ****************************************************************************/
  // Requests
  /* ****************************************************************************/

  /**
  * Handles a request completing
  * @param evt: the event that fired
  * @param session: the session this request was for
  * @param partition: the partition string for this session
  */
  handleRequestCompleted (evt, session, partition) {
    this.artificiallyPersistCookies(session, partition)
  }

  /* ****************************************************************************/
  // Cookies
  /* ****************************************************************************/

  /**
  * Forces the cookies to persist artifically. This helps users using saml signin
  * @param session: the session this request was for
  * @param partition: the partition string for this session
  */
  artificiallyPersistCookies (session, partition) {
    if (this.persistCookieThrottle[partition] !== undefined) { return }
    const stream = this.getStreamFromPartition(partition)
    if (!stream || !stream.artificiallyPersistCookies) { return }

    this.persistCookieThrottle[partition] = setTimeout(() => {
      session.cookies.get({ session: true }, (error, cookies) => {
        if (error || !cookies.length) {
          delete this.persistCookieThrottle[partition]
          return
        }
        cookies.forEach((cookie) => {
          const url = (cookie.secure ? 'https://' : 'http://') + cookie.domain + cookie.path
          session.cookies.remove(url, cookie.name, (error) => {
            if (error) { return }
            const expire = new Date().getTime() + ARTIFICIAL_COOKIE_PERSIST_PERIOD
            const persistentCookie = {
              url: url,
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path,
              secure: cookie.secure,
              httpOnly: cookie.httpOnly,
              expirationDate: expire
            }
            session.cookies.set(persistentCookie, (_) => { })
          })
        })
        delete this.persistCookieThrottle[partition]
      })
    }, ARTIFICIAL_COOKIE_PERSIST_WAIT)
  }
}

module.exports = StreamsSessionManager