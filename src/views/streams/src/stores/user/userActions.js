import alt from '../alt'
import { AUTH_KUNI_COMPLETE, AUTH_KUNI_ERROR } from 'shared/ipcEvents'
const { ipcRenderer } = window.nativeRequire('electron')

class UserActions {
  /* **************************************************************************/
  // Store Lifecyle
  /* **************************************************************************/

  /**
  * Indicates the store to drop all data and load from disk
  */
  load () { return {} }

  /* **************************************************************************/
  // Account
  /* **************************************************************************/

  remoteChangeAccount (account) {
    return { account: account }
  }

  /* **************************************************************************/
  // Auth
  /* **************************************************************************/

  /**
  * Starts the auth process with an existing stream
  * @param stream: the stream to auth against
  * @param serverArgs={}: an args dict to pass to the server
  */
  authenticateWithStream (stream, serverArgs = {}) {
    return { id: stream.id, type: stream.type, serverArgs: serverArgs }
  }

  /**
  * Starts the auth process a google account
  * @param serverArgs={}: an args dict to pass to the server
  */
  authenticateWithGoogle (serverArgs = {}) {
    return { serverArgs: serverArgs }
  }

  /**
  * Starts the auth process a microsoft account
  * @param serverArgs={}: an args dict to pass to the server
  */
  authenticateWithMicrosoft (serverArgs = {}) {
    return { serverArgs: serverArgs }
  }

  /* **************************************************************************/
  // Auth Callbacks
  /* **************************************************************************/

  /**
  * Handles a authentication ending in success
  * @param evt: the event that came over the ipc
  * @param data: the data that came across the ipc
  */
  authenticationSuccess (evt, data) {
    return {
      id: data.id,
      type: data.type,
      next: data.next
    }
  }

  /**
  * Handles an authenticating error
  * @param evt: the ipc event that fired
  * @param data: the data that came across the ipc
  */
  authenticationFailure (evt, data) {
    return { evt: evt, data: data }
  }
}

const actions = alt.createActions(UserActions)

// Auth
ipcRenderer.on(AUTH_KUNI_COMPLETE, actions.authenticationSuccess)
ipcRenderer.on(AUTH_KUNI_ERROR, actions.authenticationFailure)

export default actions
