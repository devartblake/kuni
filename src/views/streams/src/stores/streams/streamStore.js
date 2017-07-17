import alt from '../alt'
import actions from './streamActions'
import CoreStream from 'shared/Models/Accounts/CoreStream'
import StreamFactory from 'shared/Models/Accounts/StreamFactory'
import streamPersistence from './streamPersistence'
import avatarPersistence from './avatarPersistence'
import userStore from '../user/userStore'
import { PERSISTENCE_INDEX_KEY, SERVICE_LOCAL_AVATAR_PREFIX, MAILBOX_SLEEP_EXTEND } from 'shared/constants'
import { BLANK_PNG } from 'shared/b64Assets'
import uuid from 'uuid'
import streamDispatch from './streamDispatch'
import Bootstrap from 'R/Bootstrap'
import {
  WB_AUTH_GOOGLE,
  WB_AUTH_MICROSOFT,
  WB_AUTH_SLACK,
  WB_AUTH_TRELLO,
  WB_MAILBOX_STORAGE_CHANGE_ACTIVE,
  WB_PREPARE_MAILBOX_SESSION,
  WB_MAILBOXES_WINDOW_FETCH_OPEN_WINDOW_COUNT
} from 'shared/ipcEvents'

const { ipcRenderer } = window.nativeRequire('electron')
const AUTH_MODES = {
  CREATE: 'CREATE',
  REAUTHENTICATE: 'REAUTHENTICATE'
}

class MailboxStore {
  /* **************************************************************************/
  // Lifecycle
  /* **************************************************************************/

  constructor () {
    this.index = []
    this.streams = new Map()
    this.sleepingQueue = new Map()
    this.avatars = new Map()
    this.snapshots = new Map()
    this.active = null
    this.activeService = CoreStream.SERVICE_TYPES.DEFAULT
    this.search = new Map()

    /* ****************************************/
    // Streams
    /* ****************************************/

    /**
    * @return all the streams in order
    */
    this.allStreams = () => { return this.index.map((id) => this.streams.get(id)) }

    /**
    * @return all the streams in an object
    */
    this.allStreamsIndexed = () => {
      return this.allStreams().reduce((acc, stream) => {
        acc[stream.id] = stream
        return acc
      }, {})
    }

    /**
    * @return the ids
    */
    this.streamIds = () => { return Array.from(this.index) }

    /**
    * @return the stream
    */
    this.getStream = (id) => { return this.streams.get(id) || null }

    /**
    * @return the count of streams
    */
    this.streamCount = () => { return this.streams.size }

    /**
    * @param type: the type of streams to return
    * @return a list of streams with the given type
    */
    this.getStreamsOfType = (type) => {
      return this.allStreams().filter((stream) => stream.type === type)
    }

    /**
    * @return a list of streams that support wavebox auth
    */
    this.getMailboxesSupportingWaveboxAuth = () => {
      return this.allStreams().filter((stream) => stream.supportsWaveboxAuth)
    }

    /**
    * @param streamId: the id of the stream
    * @return true if this is the first stream
    */
    this.streamIsAtFirstIndex = (streamId) => {
      return this.index[0] === streamId
    }

    /**
    * @param streamId: the id of the stream
    * @return true if this is the last stream
    */
    this.streamIsAtLastIndex = (streamId) => {
      return this.index[this.index.length - 1] === streamId
    }

    /* ****************************************/
    // Stream Restrictions
    /* ****************************************/

    /**
    * @param id: the stream id
    * @param user: the current user object
    * @return true if the stream is restricted, false otherwise
    */
    this.isMailboxRestricted = (id, user) => {
      if (user.hasAccountLimit || user.hasAccountTypeRestriction) {
        return !this
          .allStreams()
          .filter((stream) => user.hasAccountsOfType(stream.type))
          .slice(0, user.accountLimit)
          .find((stream) => stream.id === id)
      } else {
        return false
      }
    }

    /**
    * @param user: the current user object
    * @return a list of unrestricted stream ids
    */
    this.unrestrictedMailboxIds = (user) => {
      if (user.hasAccountLimit || user.hasAccountTypeRestriction) {
        return this
          .allStreams()
          .filter((stream) => user.hasAccountsOfType(stream.type))
          .slice(0, user.accountLimit)
          .map((stream) => stream.id)
      } else {
        return this.streamIds()
      }
    }

    /**
    * Checks to see if the user can add a new unrestricted account
    * @param user: the curent user object
    * @return true if the user can add a stream, false otherwise
    */
    this.canAddUnrestrictedMailbox = (user) => {
      return this.unrestrictedMailboxIds(user).length < user.accountLimit
    }

    /* ****************************************/
    // Services
    /* ****************************************/

    /**
    * @return a list of all services
    */
    this.allServices = () => {
      return this.allStreams().reduce((acc, stream) => {
        return acc.concat(stream.enabledServices)
      }, [])
    }

    /**
    * @return an array of services that support compose
    */
    this.getServicesSupportingCompose = () => {
      return this.allServices().filter((service) => service.supportsCompose)
    }

    /**
    * @param protocol: the protocol to get services for
    * @return an array of services that support the given protocol
    */
    this.getServicesSupportingProtocol = (protocol) => {
      return this.allServices().filter((service) => service.supportedProtocols.has(protocol))
    }

    /* ****************************************/
    // Avatar
    /* ****************************************/

    /**
    * @param id: the id of the stream
    * @return the avatar base64 string or a blank png string
    */
    this.getAvatar = (id) => { return this.avatars.get(id) || BLANK_PNG }

    /**
    * Gets the stream avatar using the order of precidence
    * @param id: the id of the stream
    * @return the url/base64 avatar url or undefiend if none
    */
    this.getResolvedAvatar = (id) => {
      const stream = this.getMailbox(id)
      if (!stream) { return }

      if (stream.hasCustomAvatar) {
        return this.getAvatar(stream.customAvatarId)
      } else if (stream.avatarURL) {
        return stream.avatarURL
      } else if (stream.hasServiceLocalAvatar) {
        return this.getAvatar(stream.serviceLocalAvatarId)
      } else if (!stream.avatarCharacterDisplay) {
        if (stream.humanizedLogo) {
          return '../../' + stream.humanizedLogo
        } else if (stream.serviceForType(CoreStream.SERVICE_TYPES.DEFAULT).humanizedLogo) {
          return '../../' + stream.serviceForType(CoreStream.SERVICE_TYPES.DEFAULT).humanizedLogo
        }
      }
    }

    /* ****************************************/
    // Snapshots
    /* ****************************************/

    /**
    * @param id: the id of the stream
    * @param service: the type of service
    * @return the snapshot base64 string
    */
    this.getSnapshot = (id, service) => { return this.snapshots.get(`${id}:${service}`) }

    /* ****************************************/
    // Active
    /* ****************************************/

    /**
    * @return the id of the active stream
    */
    this.activeMailboxId = () => { return this.active }

    /**
    * @return the service type of the active stream
    */
    this.activeMailboxService = () => {
      if (this.activeService === CoreStream.SERVICE_TYPES.DEFAULT) {
        return CoreStream.SERVICE_TYPES.DEFAULT
      } else {
        const stream = this.activeMailbox()
        if (stream) {
          const service = stream.serviceForType(this.activeService)
          return service ? this.activeService : CoreStream.SERVICE_TYPES.DEFAULT
        } else {
          return CoreStream.SERVICE_TYPES.DEFAULT
        }
      }
    }

    /**
    * @return the active stream
    */
    this.activeMailbox = () => { return this.streams.get(this.active) }

    /**
    * @param streamId: the id of the stream
    * @param service: the type of service
    * @return true if this stream is active, false otherwise
    */
    this.isActive = (streamId, service) => {
      return this.activeMailboxId() === streamId && this.activeMailboxService() === service
    }

    /* ****************************************/
    // Sleeping
    /* ****************************************/

    /**
    * @param streamId: the id of the stream
    * @param serviceType: the type of service
    * @return true if the stream is sleeping
    */
    this.isSleeping = (streamId, serviceType) => {
      if (!userStore.getState().user.hasSleepable) { return false }

      // Check we support sleeping
      const stream = this.getMailbox(streamId)
      const service = stream ? stream.serviceForType(serviceType) : undefined
      if (!service || !service.sleepable) { return false }

      // Check if we are active
      if (this.isActive(streamId, serviceType)) { return false }

      // Check if we are queued for sleeping sleeping
      const key = `${streamId}:${serviceType}`
      if (this.sleepingQueue.has(key)) {
        return this.sleepingQueue.get(key).sleeping === true
      } else {
        return true
      }
    }

    /* ****************************************/
    // Search
    /* ****************************************/

    /**
    * @param streamId: the id of the stream
    * @param service: the service of the stream
    * @return true if the stream is searching, false otherwise
    */
    this.isSearchingMailbox = (streamId, service) => {
      return this.search.has(`${streamId}:${service}`)
    }

    /**
    * @param streamId: the id of the stream
    * @param service: the service of the stream
    * @return the search term for the stream
    */
    this.streamSearchTerm = (streamId, service) => {
      return (this.search.get(`${streamId}:${service}`) || {}).term || ''
    }

    /**
    * @param streamId: the id of the stream
    * @param service: the service of the stream
    * @return the search has for the stream
    */
    this.streamSearchHash = (streamId, service) => {
      return (this.search.get(`${streamId}:${service}`) || {}).hash || ''
    }

    /* ****************************************/
    // Unread
    /* ****************************************/

    /**
    * @return the total amount of unread items
    */
    this.totalUnreadCount = () => {
      return this.allStreams().reduce((acc, stream) => {
        if (stream) {
          acc += stream.unreadCount
        }
        return acc
      }, 0)
    }

    /**
    * @return the total amount of unread items taking stream settings into account
    */
    this.totalUnreadCountForAppBadge = () => {
      return this.allStreams().reduce((acc, stream) => {
        if (stream && stream.unreadCountsTowardsAppUnread) {
          acc += stream.unreadCount
        }
        return acc
      }, 0)
    }

    /**
    * @return true if any streams have another unread info status, taking settings into account
    */
    this.hasUnreadActivityForAppBadge = () => {
      return !!this.allStreams().find((stream) => {
        return stream && stream.unreadActivityCountsTowardsAppUnread && stream.hasUnreadActivity
      })
    }

    /* ****************************************/
    // Takeout
    /* ****************************************/

    /**
    * Exports the data synchronously
    * @return the raw data
    */
    this.exportMailboxDataSync = () => {
      const allData = streamPersistence.allItemsSync()
      return Object.keys(allData)
        .reduce((acc, id) => {
          if (id === PERSISTENCE_INDEX_KEY) {
            acc[id] = allData[id]
          } else {
            const data = JSON.parse(allData[id])
            const MailboxClass = MailboxFactory.getClass(data.type)
            if (MailboxClass) {
              acc[id] = JSON.stringify(MailboxClass.prepareForExport(id, data))
            } else {
              acc[id] = allData[id]
            }
          }
          return acc
        }, {})
    }

    /**
    * Exports the data synchronously
    * @return the raw data
    */
    this.exportAvatarDataSync = () => {
      return avatarPersistence.allItemsSync()
    }

    /* ****************************************/
    // Listeners
    /* ****************************************/

    this.bindListeners({
      // Store lifecycle
      handleLoad: actions.LOAD,
      handleRemoteChange: actions.REMOTE_CHANGE,

      // Stream auth
      handleAuthenticateGinboxMailbox: actions.AUTHENTICATE_GINBOX_MAILBOX,
      handleAuthenticateGmailMailbox: actions.AUTHENTICATE_GMAIL_MAILBOX,
      handleAuthenticateSlackMailbox: actions.AUTHENTICATE_SLACK_MAILBOX,
      handleAuthenticateTrelloMailbox: actions.AUTHENTICATE_TRELLO_MAILBOX,
      handleAuthenticateOutlookMailbox: actions.AUTHENTICATE_OUTLOOK_MAILBOX,
      handleAuthenticateOffice365Mailbox: actions.AUTHENTICATE_OFFICE365MAILBOX,
      handleAuthenticateGenericMailbox: actions.AUTHENTICATE_GENERIC_MAILBOX,

      // Stream re-auth
      handleReauthenticateMailbox: actions.REAUTHENTICATE_MAILBOX,
      handleReauthenticateGoogleMailbox: actions.REAUTHENTICATE_GOOGLE_MAILBOX,
      handleReauthenticateMicrosoftMailbox: actions.REAUTHENTICATE_MICROSOFT_MAILBOX,
      handleReauthenticateSlackMailbox: actions.REAUTHENTICATE_SLACK_MAILBOX,
      handleReauthenticateTrelloMailbox: actions.REAUTHENTICATE_TRELLO_MAILBOX,

      // Stream auth callbacks
      handleAuthGoogleMailboxSuccess: actions.AUTH_GOOGLE_MAILBOX_SUCCESS,
      handleAuthGoogleMailboxFailure: actions.AUTH_GOOGLE_MAILBOX_FAILURE,
      handleAuthSlackMailboxSuccess: actions.AUTH_SLACK_MAILBOX_SUCCESS,
      handleAuthSlackMailboxFailure: actions.AUTH_SLACK_MAILBOX_FAILURE,
      handleAuthTrelloMailboxSuccess: actions.AUTH_TRELLO_MAILBOX_SUCCESS,
      handleAuthTrelloMailboxFailure: actions.AUTH_TRELLO_MAILBOX_FAILURE,
      handleAuthMicrosoftMailboxSuccess: actions.AUTH_MICROSOFT_MAILBOX_SUCCESS,
      handleAuthMicrosoftMailboxFailure: actions.AUTH_MICROSOFT_MAILBOX_FAILURE,

      // Stream lifecycle
      handleConnectAllMailboxes: actions.CONNECT_ALL_MAILBOXES,
      handleConnectMailbox: actions.CONNECT_MAILBOX,
      handleDisconnectAllMailboxes: actions.DISCONNECT_ALL_MAILBOXES,
      handleDisconnectMailbox: actions.DISCONNECT_MAILBOX,

      // Streams
      handleCreate: actions.CREATE,
      handleRemove: actions.REMOVE,
      handleMoveUp: actions.MOVE_UP,
      handleMoveDown: actions.MOVE_DOWN,
      handleReduce: actions.REDUCE,

      // Avatar
      handleSetCustomAvatar: actions.SET_CUSTOM_AVATAR,
      handleSetServiceLocalAvatar: actions.SET_SERVICE_LOCAL_AVATAR,

      // Snapshots
      handleSetServiceSnapshot: actions.SET_SERVICE_SNAPSHOT,

      // Services
      handleReduceService: actions.REDUCE_SERVICE,

      // Active
      handleChangeActive: actions.CHANGE_ACTIVE,
      handleChangeActiveServiceIndex: actions.CHANGE_ACTIVE_SERVICE_INDEX,
      handleChangeActivePrev: actions.CHANGE_ACTIVE_TO_PREV,
      handleChangeActiveNext: actions.CHANGE_ACTIVE_TO_NEXT,

      // Sleeping
      handleAwakenService: actions.AWAKEN_SERVICE,
      handleSleepService: actions.SLEEP_SERVICE,

      // Search
      handleStartSearchingMailbox: actions.START_SEARCHING_MAILBOX,
      handleUntrackSearchingMailbox: actions.UNTRACK_SEARCHING_MAILBOX,
      handleStopSearchingMailbox: actions.STOP_SEARCHING_MAILBOX,
      handleSetSearchTerm: actions.SET_SEARCH_TERM,
      handleSearchNextTerm: actions.SEARCH_NEXT_TERM,

      // Sync
      handleFullSyncMailbox: actions.FULL_SYNC_MAILBOX,

      // Misc
      handlePingResourceUsage: actions.PING_RESOURCE_USAGE
    })
  }

  /* **************************************************************************/
  // Handlers: Store Lifecycle
  /* **************************************************************************/

  handleLoad () {
    // Load
    const allAvatars = avatarPersistence.allItemsSync()
    const allStreams = streamPersistence.allJSONItemsSync()
    this.index = []
    this.streams = new Map()
    this.avatars = new Map()

    // Streams
    Object.keys(allStreams).forEach((id) => {
      if (id === PERSISTENCE_INDEX_KEY) {
        this.index = allStreams[PERSISTENCE_INDEX_KEY]
      } else {
        const streamModel = MailboxFactory.modelize(id, allStreams[id])
        this.streams.set(id, streamModel)
        ipcRenderer.sendSync(WB_PREPARE_MAILBOX_SESSION, { // Sync us across bridge so everything is setup before webview created
          partition: 'persist:' + streamModel.partition,
          streamType: streamModel.type
        })
      }
    })
    this.active = this.index[0] || null
    this.sendActiveStateToMainThread()

    // Avatars
    Object.keys(allAvatars).forEach((id) => {
      this.avatars.set(id, allAvatars[id])
    })
  }

  handleRemoteChange () {
    /* no-op */
  }

  /* **************************************************************************/
  // Providers: Utils
  /* **************************************************************************/

  /**
  * Saves a local stream ensuring changed time etc update accordingly and data sent up socket
  * @param id: the id of the provider
  * @param streamJS: the new js object for the stream or null to remove
  * @return the generated model
  */
  saveMailbox (id, streamJS) {
    // @future send stream to sever?
    if (streamJS === null) {
      streamPersistence.removeItem(id)
      this.streams.delete(id)
      return undefined
    } else {
      streamJS.changedTime = new Date().getTime()
      streamJS.id = id
      const model = MailboxFactory.modelize(id, streamJS)
      streamPersistence.setJSONItem(id, streamJS)
      this.streams.set(id, model)
      return model
    }
  }

  /**
  * Persist the provided index
  * @param index: the index to persist
  */
  saveIndex (index) {
    // @future send stream index to sever?
    this.index = index
    streamPersistence.setJSONItem(PERSISTENCE_INDEX_KEY, index)
  }

  /* **************************************************************************/
  // Stream Auth
  /* **************************************************************************/

  handleAuthenticateGinboxMailbox ({ provisionalId }) {
    this.preventDefault()
    window.location.hash = '/stream_wizard/authenticating'
    ipcRenderer.send(WB_AUTH_GOOGLE, {
      credentials: Bootstrap.credentials,
      id: provisionalId,
      provisional: GoogleMailbox.createJS(provisionalId, GoogleDefaultService.ACCESS_MODES.GINBOX)
    })
  }

  handleAuthenticateGmailMailbox ({ provisionalId }) {
    this.preventDefault()
    window.location.hash = '/stream_wizard/authenticating'
    ipcRenderer.send(WB_AUTH_GOOGLE, {
      credentials: Bootstrap.credentials,
      id: provisionalId,
      provisional: GoogleMailbox.createJS(provisionalId, GoogleDefaultService.ACCESS_MODES.GMAIL)
    })
  }

  handleAuthenticateSlackMailbox ({ provisionalId }) {
    this.preventDefault()
    window.location.hash = '/stream_wizard/authenticating'
    ipcRenderer.send(WB_AUTH_SLACK, {
      id: provisionalId,
      provisional: SlackMailbox.createJS(provisionalId)
    })
  }

  handleAuthenticateTrelloMailbox ({ provisionalId }) {
    this.preventDefault()
    window.location.hash = '/stream_wizard/authenticating'
    ipcRenderer.send(WB_AUTH_TRELLO, {
      credentials: Bootstrap.credentials,
      id: provisionalId,
      provisional: TrelloMailbox.createJS(provisionalId)
    })
  }

  handleAuthenticateOutlookMailbox ({ provisionalId }) {
    this.preventDefault()
    window.location.hash = '/stream_wizard/authenticating'
    ipcRenderer.send(WB_AUTH_MICROSOFT, {
      credentials: Bootstrap.credentials,
      id: provisionalId,
      provisional: MicrosoftMailbox.createJS(provisionalId, MicrosoftMailbox.ACCESS_MODES.OUTLOOK)
    })
  }

  handleAuthenticateOffice365Mailbox ({ provisionalId }) {
    this.preventDefault()
    window.location.hash = '/stream_wizard/authenticating'
    ipcRenderer.send(WB_AUTH_MICROSOFT, {
      credentials: Bootstrap.credentials,
      id: provisionalId,
      provisional: MicrosoftMailbox.createJS(provisionalId, MicrosoftMailbox.ACCESS_MODES.OFFICE365)
    })
  }

  handleAuthenticateGenericMailbox ({ provisionalId }) {
    this.preventDefault()
    actions.create.defer(provisionalId, GenericMailbox.createJS(provisionalId))
    window.location.hash = '/stream_wizard/generic/configure/' + provisionalId
  }

  /* **************************************************************************/
  // Stream Re-auth
  /* **************************************************************************/

  handleReauthenticateMailbox ({ streamId }) {
    const stream = this.streams.get(streamId)
    if (stream) {
      switch (stream.type) {
        case CoreStream.MAILBOX_TYPES.GOOGLE:
          actions.reauthenticateGoogleMailbox.defer(streamId)
          break
        case CoreStream.MAILBOX_TYPES.MICROSOFT:
          actions.reauthenticateMicrosoftMailbox.defer(streamId)
          break
        case CoreStream.MAILBOX_TYPES.TRELLO:
          actions.reauthenticateTrelloMailbox.defer(streamId)
          break
        case CoreStream.MAILBOX_TYPES.SLACK:
          actions.reauthenticateSlackMailbox.defer(streamId)
          break
        default:
          throw new Error('Stream does not support reauthentication')
      }
    }
    this.preventDefault()
  }

  handleReauthenticateGoogleMailbox ({ streamId }) {
    this.preventDefault()
    if (!this.streams.get(streamId)) { return }

    window.location.hash = '/stream_wizard/authenticating'
    ipcRenderer.send(WB_AUTH_GOOGLE, {
      credentials: Bootstrap.credentials,
      id: streamId,
      authMode: AUTH_MODES.REAUTHENTICATE,
      provisional: null
    })
  }

  handleReauthenticateMicrosoftMailbox ({ streamId }) {
    this.preventDefault()
    if (!this.streams.get(streamId)) { return }

    window.location.hash = '/stream_wizard/authenticating'
    ipcRenderer.send(WB_AUTH_MICROSOFT, {
      credentials: Bootstrap.credentials,
      id: streamId,
      authMode: AUTH_MODES.REAUTHENTICATE,
      provisional: null
    })
  }

  handleReauthenticateSlackMailbox ({ streamId }) {
    this.preventDefault()
    if (!this.streams.get(streamId)) { return }

    window.location.hash = '/stream_wizard/authenticating'
    ipcRenderer.send(WB_AUTH_SLACK, {
      id: streamId,
      provisional: null,
      authMode: AUTH_MODES.REAUTHENTICATE
    })
  }

  handleReauthenticateTrelloMailbox ({ streamId }) {
    this.preventDefault()
    if (!this.streams.get(streamId)) { return }

    window.location.hash = '/stream_wizard/authenticating'
    ipcRenderer.send(WB_AUTH_TRELLO, {
      credentials: Bootstrap.credentials,
      id: streamId,
      provisional: null,
      authMode: AUTH_MODES.REAUTHENTICATE
    })
  }

  /**
  * Finalizes a re-authentication by ensuring the stream re-syncs and reloads
  * @param streamId: the id of the stream
  */
  _finalizeReauthentication (streamId) {
    actions.fullSyncMailbox.defer(streamId)
    actions.connectMailbox.defer(streamId)
    setTimeout(() => { streamDispatch.reload(streamId) }, 500)
    window.location.hash = '/'
  }

  /* **************************************************************************/
  // Stream Auth Callbacks
  /* **************************************************************************/

  handleAuthGoogleMailboxSuccess ({ provisionalId, provisional, temporaryCode, pushToken, authMode, codeRedirectUri }) {
    Promise.resolve()
      .then(() => GoogleHTTP.upgradeAuthCodeToPermenant(temporaryCode, codeRedirectUri))
      .then((auth) => {
        return GoogleHTTP.fetchAccountProfileWithRawAuth(auth)
          .then((response) => { // Build the complete auth object
            return Object.assign(auth, {
              pushToken: pushToken,
              email: (response.emails.find((a) => a.type === 'account') || {}).value
            })
          })
      })
      .then((auth) => {
        if (authMode === AUTH_MODES.REAUTHENTICATE) {
          actions.reduce.defer(provisionalId, (stream, auth) => {
            return stream.changeData({ auth: auth })
          }, auth)
          this._finalizeReauthentication(provisionalId)
        } else {
          actions.create.defer(provisionalId, Object.assign(provisional, {
            auth: auth
          }))
          const accessMode = ((provisional.services || []).find((service) => service.type === GoogleDefaultService.type) || {}).accessMode
          if (accessMode === GoogleDefaultService.ACCESS_MODES.GMAIL) {
            window.location.hash = '/stream_wizard/google/configuregmail/' + provisionalId
          } else {
            window.location.hash = '/stream_wizard/google/configureinbox/' + provisionalId
          }
        }
      })
      .catch((err) => {
        console.error('[AUTH ERR]', err)
      })
  }

  handleAuthGoogleMailboxFailure ({ evt, data }) {
    window.location.hash = '/'
    if (data.errorMessage.toLowerCase().indexOf('user') === 0) {
      /* user cancelled. no-op */
    } else {
      console.error('[AUTH ERR]', data)
    }
  }

  handleAuthSlackMailboxSuccess ({ provisionalId, provisional, teamUrl, token, authMode }) {
    SlackHTTP.testAuth(token)
      .then((userInfo) => {
        const auth = {
          access_token: token,
          url: userInfo.url,
          team_name: userInfo.team,
          team_id: userInfo.team_id,
          user_name: userInfo.user,
          user_id: userInfo.user_id
        }

        if (authMode === AUTH_MODES.REAUTHENTICATE) {
          actions.reduce.defer(provisionalId, (stream, auth) => {
            return stream.changeData({ auth: auth })
          }, auth)
          this._finalizeReauthentication(provisionalId)
        } else {
          actions.create.defer(provisionalId, Object.assign(provisional, {
            auth: auth
          }))
          window.location.hash = `/stream_wizard/complete/${provisionalId}`
        }
      }).catch((err) => {
        console.error('[AUTH ERR]', err)
      })
  }

  handleAuthSlackMailboxFailure ({ evt, data }) {
    window.location.hash = '/'
    if (data.errorMessage.toLowerCase().indexOf('user') === 0) {
      /* user cancelled. no-op */
    } else {
      console.error('[AUTH ERR]', data)
    }
  }

  handleAuthTrelloMailboxSuccess ({ provisionalId, provisional, authToken, authAppKey, authMode }) {
    if (authMode === AUTH_MODES.REAUTHENTICATE) {
      actions.reduce.defer(provisionalId, (stream, auth) => {
        return stream.changeData({
          authToken: auth.authToken,
          authAppKey: auth.authAppKey
        })
      }, { authToken: authToken, authAppKey: authAppKey })
      this._finalizeReauthentication(provisionalId)
    } else {
      actions.create.defer(provisionalId, Object.assign(provisional, {
        authToken: authToken,
        authAppKey: authAppKey
      }))
      window.location.hash = `/stream_wizard/complete/${provisionalId}`
    }
  }

  handleAuthTrelloMailboxFailure ({ evt, data }) {
    window.location.hash = '/'
    if (data.errorMessage.toLowerCase().indexOf('user') === 0) {
      /* user cancelled. no-op */
    } else {
      console.error('[AUTH ERR]', data)
    }
  }

  handleAuthMicrosoftMailboxSuccess ({ provisionalId, provisional, temporaryCode, authMode, codeRedirectUri }) {
    Promise.resolve()
      .then(() => MicrosoftHTTP.upgradeAuthCodeToPermenant(temporaryCode, codeRedirectUri))
      .then((auth) => {
        if (authMode === AUTH_MODES.REAUTHENTICATE) {
          actions.reduce.defer(provisionalId, (stream, auth) => {
            return stream.changeData({ auth: auth })
          }, auth)
          this._finalizeReauthentication(provisionalId)
        } else {
          actions.create.defer(provisionalId, Object.assign(provisional, {
            auth: auth
          }))
          window.location.hash = '/stream_wizard/microsoft/services/' + provisionalId
        }
      }).catch((err) => {
        console.error('[AUTH ERR]', err)
      })
  }

  handleAuthMicrosoftMailboxFailure ({ evt, data }) {
    window.location.hash = '/'
    if (data.errorMessage.toLowerCase().indexOf('user') !== -1) {
      /* user cancelled. no-op */
    } else {
      console.error('[AUTH ERR]', data)
    }
  }

  /* **************************************************************************/
  // Handlers: Stream lifecycle
  /* **************************************************************************/

  handleConnectAllStreams () {
    this.streamIds().forEach((streamId) => {
      actions.connectMailbox.defer(streamId)
    })
    this.preventDefault()
  }

  handleConnectMailbox ({ streamId }) {
    const stream = this.getMailbox(streamId)
    if (!stream) {
      this.preventDefault()
      return
    }

    if (stream.type === GoogleMailbox.type) {
      googleActions.connectMailbox.defer(streamId)
      this.preventDefault() // No change in this store
    } else if (stream.type === SlackMailbox.type) {
      slackActions.connectMailbox.defer(streamId)
      this.preventDefault() // No change in this store
    }
  }

  handleDisconnectAllMailboxes () {
    this.streamIds().forEach((streamId) => {
      actions.disconnectMailbox.defer(streamId)
    })
    this.preventDefault()
  }

  handleDisconnectMailbox ({ streamId }) {
    const stream = this.getMailbox(streamId)
    if (!stream) {
      this.preventDefault()
      return
    }

    if (stream.type === GoogleMailbox.type) {
      googleActions.disconnectMailbox.defer(streamId)
      this.preventDefault() // No change in this store
    } else if (stream.type === SlackMailbox.type) {
      slackActions.disconnectMailbox.defer(streamId)
      this.preventDefault() // No change in this store
    }
  }

  /* **************************************************************************/
  // Handlers: Streams
  /* **************************************************************************/

  handleCreate ({ id, data }) {
    const streamModel = this.saveMailbox(id, data)
    this.saveIndex(this.index.concat(id))
    ipcRenderer.sendSync(WB_PREPARE_MAILBOX_SESSION, { // Sync us across bridge so everything is setup before webview created
      partition: 'persist:' + streamModel.partition,
      streamType: streamModel.type
    })
    actions.changeActive.defer(id)
    actions.fullSyncMailbox.defer(id)
    actions.connectMailbox.defer(id)
  }

  handleRemove ({ id = this.activeMailboxId() }) {
    id = id || this.activeMailboxId()

    const wasActive = this.active === id
    this.saveMailbox(id, null)
    this.saveIndex(this.index.filter((i) => i !== id))
    if (wasActive) {
      actions.changeActive.defer(undefined)
    }
    actions.disconnectMailbox.defer(id)
  }

  handleMoveUp ({ id = this.activeMailboxId() }) {
    id = id || this.activeMailboxId()

    const index = Array.from(this.index)
    const streamIndex = index.findIndex((i) => i === id)
    if (streamIndex !== -1 && streamIndex !== 0) {
      index.splice(streamIndex - 1, 0, index.splice(streamIndex, 1)[0])
      this.saveIndex(index)
    } else {
      this.preventDefault()
    }
  }

  handleMoveDown ({ id = this.activeMailboxId() }) {
    id = id || this.activeMailboxId()

    const index = Array.from(this.index)
    const streamIndex = index.findIndex((i) => i === id)
    if (streamIndex !== -1 && streamIndex < index.length) {
      index.splice(streamIndex + 1, 0, index.splice(streamIndex, 1)[0])
      this.saveIndex(index)
    } else {
      this.preventDefault()
    }
  }

  handleReduce ({ id = this.activeMailboxId(), reducer, reducerArgs }) {
    const stream = this.streams.get(id)
    if (stream) {
      const updatedJS = reducer.apply(this, [stream].concat(reducerArgs))
      if (updatedJS) {
        this.saveMailbox(id, updatedJS)
      } else {
        this.preventDefault()
      }
    } else {
      this.preventDefault()
    }
  }

  /* **************************************************************************/
  // Handlers: Avatar
  /* **************************************************************************/

  handleSetCustomAvatar ({id, b64Image}) {
    const stream = this.streams.get(id)
    const data = stream.cloneData()
    if (b64Image) {
      if (data.customAvatar && this.avatars.get(data.customAvatar) === b64Image) {
        // Setting the same image. Nothing to do
        this.preventDefault()
        return
      } else {
        if (data.customAvatar) {
          avatarPersistence.removeItem(data.customAvatar)
          this.avatars.delete(data.customAvatar)
        }
        const imageId = uuid.v4()
        data.customAvatar = imageId
        avatarPersistence.setItem(imageId, b64Image)
        this.avatars.set(imageId, b64Image)
      }
    } else {
      if (data.customAvatar) {
        avatarPersistence.removeItem(data.customAvatar)
        this.avatars.delete(data.customAvatar)
        delete data.customAvatar
      }
    }
    this.saveMailbox(id, data)
  }

  handleSetServiceLocalAvatar ({ id, b64Image }) {
    const stream = this.streams.get(id)
    const data = stream.cloneData()
    if (b64Image) {
      if (data.serviceLocalAvatar && this.avatars.get(data.serviceLocalAvatar) === b64Image) {
        // Setting the same image. Nothing to do
        this.preventDefault()
        return
      } else {
        if (data.serviceLocalAvatar) {
          avatarPersistence.removeItem(data.serviceLocalAvatar)
          this.avatars.delete(data.serviceLocalAvatar)
        }
        const imageId = SERVICE_LOCAL_AVATAR_PREFIX + uuid.v4()
        data.serviceLocalAvatar = imageId
        avatarPersistence.setItem(imageId, b64Image)
        this.avatars.set(imageId, b64Image)
      }
    } else {
      if (data.serviceLocalAvatar) {
        avatarPersistence.removeItem(data.serviceLocalAvatar)
        this.avatars.delete(data.serviceLocalAvatar)
        delete data.serviceLocalAvatarr
      }
    }
    this.saveMailbox(id, data)
  }

  /* **************************************************************************/
  // Handlers: Snapshots
  /* **************************************************************************/

  handleSetServiceSnapshot ({ id, service, snapshot }) {
    this.snapshots.set(`${id}:${service}`, snapshot)
  }

  /* **************************************************************************/
  // Handlers: Service
  /* **************************************************************************/

  handleReduceService ({ id = this.activeMailboxId(), serviceType = this.activeMailboxService(), reducer, reducerArgs }) {
    const stream = this.streams.get(id)
    if (stream) {
      const service = stream.serviceForType(serviceType)
      if (service) {
        const updatedServiceJS = reducer.apply(this, [stream, service].concat(reducerArgs))
        if (updatedServiceJS) {
          const updatedMailboxJS = stream.changeData({
            services: stream.enabledServices.map((service) => {
              if (service.type === serviceType) {
                return updatedServiceJS
              } else {
                return service.cloneData()
              }
            })
          })
          this.saveMailbox(id, updatedMailboxJS)
          return
        }
      }
    }
    this.preventDefault()
  }

  /* **************************************************************************/
  // Handlers : Active
  /* **************************************************************************/

  /**
  * Handles the active stream changing
  * @param id: the id of the stream
  * @param service: the service type
  */
  handleChangeActive ({id, service}) {
    if (this.isMailboxRestricted(id, userStore.getState().user)) {
      this.preventDefault()
      window.location.hash = '/pro'
    } else {
      const nextMailbox = id || this.index[0]
      const nextService = service || CoreStream.SERVICE_TYPES.DEFAULT

      // Check we actually did change
      if (nextMailbox === this.active && nextService === this.activeService) {
        this.preventDefault()
        return
      }

      // Make the change
      this.scheduleSleep(this.active, this.activeService)
      this.clearSleep(nextMailbox, nextService)
      this.active = nextMailbox
      this.activeService = nextService
      this.sendActiveStateToMainThread()
    }
  }

  /**
  * Handles changing the active service to the one at the service
  * @param index: the index of the service
  */
  handleChangeActiveServiceIndex ({ index }) {
    if (this.isMailboxRestricted(this.active, userStore.getState().user)) {
      window.location.hash = '/pro'
    } else {
      const stream = this.getMailbox(this.active)
      if (stream.enabledServiceTypes[index]) {
        actions.changeActive.defer(stream.id, stream.enabledServiceTypes[index])
      }
    }
  }

  /**
  * Handles the active stream changing to the prev in the index
  * @param allowCycling: if true will cycle back when at end or beginning
  */
  handleChangeActivePrev ({ allowCycling }) {
    const activeIndex = this.index.findIndex((id) => id === this.active)
    let nextId
    if (allowCycling && activeIndex === 0) {
      nextId = this.index[this.index.length - 1] || null
    } else {
      nextId = this.index[Math.max(0, activeIndex - 1)] || null
    }
    actions.changeActive.defer(nextId)
  }

  /**
  * Handles the active stream changing to the next in the index
  * @param allowCycling: if true will cycle back when at end or beginning
  */
  handleChangeActiveNext ({ allowCycling }) {
    const activeIndex = this.index.findIndex((id) => id === this.active)
    let nextId
    if (allowCycling && activeIndex === this.index.length - 1) {
      nextId = this.index[0] || null
    } else {
      nextId = this.index[Math.min(this.index.length - 1, activeIndex + 1)] || null
    }
    actions.changeActive.defer(nextId)
  }

  /**
  * Sends the current active state to the main thread
  */
  sendActiveStateToMainThread () {
    ipcRenderer.send(WB_MAILBOX_STORAGE_CHANGE_ACTIVE, {
      streamId: this.activeMailboxId(),
      serviceType: this.activeMailboxService()
    })
  }

  /* **************************************************************************/
  // Handlers : Sleep
  /* **************************************************************************/

  handleAwakenService ({ id, service }) {
    this.clearSleep(id, service)
    const key = `${id}:${service}`
    this.sleepingQueue.set(key, { sleeping: false, timer: null })
  }

  handleSleepService ({ id, service }) {
    this._sendMailboxToSleep(id, service)
  }

  /**
  * Clears sleep for a stream and service
  * @param streamId: the id of the stream
  * @param serviceType: the type of service
  */
  clearSleep (streamId, serviceType) {
    const key = `${streamId}:${serviceType}`
    if (this.sleepingQueue.has(key)) {
      clearTimeout(this.sleepingQueue.get(key).timer)
      this.sleepingQueue.delete(key)
    }
  }

  /**
  * Schedules a new sleep for a stream/service
  * @param streamId: the id of the stream
  * @param serviceType: the type of service
  */
  scheduleSleep (streamId, serviceType) {
    this.clearSleep(streamId, serviceType)

    const stream = this.getMailbox(streamId)
    const service = stream ? stream.serviceForType(serviceType) : undefined
    const wait = service ? service.sleepableTimeout : 0

    if (wait <= 0) {
      this._sendMailboxToSleep(streamId, serviceType)
    } else {
      const key = `${streamId}:${serviceType}`
      this.sleepingQueue.set(key, {
        sleeping: false,
        timer: setTimeout(() => {
          this._sendMailboxToSleep(streamId, serviceType)
        }, wait)
      })
    }
  }

  /**
  * Runs the process of sending a webview to sleep whilst also checking if it owns any other windows
  * @param streamId: the id of the stream
  * @param serviceType: the type of service
  */
  _sendMailboxToSleep (streamId, serviceType) {
    const key = `${streamId}:${serviceType}`
    const responseId = uuid.v4()
    const responder = (evt, { count }) => {
      if (this.isSleeping(streamId, serviceType)) { return }

      if (count === 0) {
        this.clearSleep(streamId, serviceType)
        this.sleepingQueue.set(key, { sleeping: true, timer: null })
        this.emitChange()
      } else {
        this.clearSleep(streamId, serviceType)
        this.sleepingQueue.set(key, {
          sleeping: false,
          timer: setTimeout(() => {
            this._sendMailboxToSleep(streamId, serviceType)
          }, MAILBOX_SLEEP_EXTEND)
        })
      }
    }

    ipcRenderer.once(responseId, responder)
    ipcRenderer.send(WB_MAILBOXES_WINDOW_FETCH_OPEN_WINDOW_COUNT, {
      streamId: streamId,
      serviceType: serviceType,
      response: responseId
    })
  }

  /* **************************************************************************/
  // Handlers : Search
  /* **************************************************************************/

  /**
  * Indicates the stream is searching
  */
  handleStartSearchingMailbox ({ id, service }) {
    const key = `${id || this.active}:${service || this.activeService}`
    this.search.set(key, { term: '', hash: `${Math.random()}` })
  }

  /**
  * Indicates the stream is no longer tracking search (i.e. handled by another provider)
  */
  handleUntrackSearchingMailbox ({ id, service }) {
    const key = `${id || this.active}:${service || this.activeService}`
    this.search.delete(key)
  }

  /**
  * Indicates the stream is no longer searching
  */
  handleStopSearchingMailbox ({id, service}) {
    const key = `${id || this.active}:${service || this.activeService}`
    this.search.delete(key)
  }

  /**
  * Sets the search term for a stream
  */
  handleSetSearchTerm ({ id, service, str }) {
    const key = `${id || this.active}:${service || this.activeService}`
    this.search.set(key, { term: str, hash: `${Math.random()}` })
  }

  /**
  * Indicates the user wants to search next
  */
  handleSearchNextTerm ({ id, service }) {
    const key = `${id || this.active}:${service || this.activeService}`
    if (this.search.has(key)) {
      this.search.set(key, Object.assign({}, this.search.get(key), { hash: `${Math.random()}` }))
    } else {
      this.search.set(key, { term: '', hash: `${Math.random()}` })
    }
  }

  /* **************************************************************************/
  // Handlers : Sync
  /* **************************************************************************/

  /**
  * Runs a full sync on a stream
  */
  handleFullSyncMailbox ({ id }) {
    const stream = this.getMailbox(id)
    if (!stream) { return }

    if (stream.type === GoogleMailbox.type) {
      googleActions.syncMailboxProfile.defer(id)
      googleActions.connectMailbox.defer(id)
      googleActions.registerMailboxWatch.defer(id)
      googleActions.syncMailboxMessages.defer(id, true)
      this.preventDefault() // No change in this store
    } else if (stream.type === TrelloMailbox.type) {
      trelloActions.syncMailboxProfile.defer(id)
      trelloActions.syncMailboxNotifications.defer(id)
      this.preventDefault() // No change in this store
    } else if (stream.type === SlackMailbox.type) {
      slackActions.connectMailbox.defer(id)
      slackActions.updateUnreadCounts.defer(id)
      this.preventDefault() // No change in this store
    } else if (stream.type === MicrosoftMailbox.type) {
      microsoftActions.syncMailboxProfile.defer(id)
      microsoftActions.syncMailboxMail.defer(id)
      this.preventDefault() // No change in this store
    }
  }

  /* **************************************************************************/
  // Handlers : Misc
  /* **************************************************************************/

  handlePingResourceUsage () {
    this.preventDefault()
    this.allStreams().forEach((stream) => {
      stream.enabledServices.forEach((service) => {
        const description = `Stream WebView: ${stream.displayName}:${service.humanizedType}`
        streamDispatch.pingResourceUsage(stream.id, service.type, description)
      })
    })
  }
}

export default alt.createStore(MailboxStore, 'MailboxStore')
