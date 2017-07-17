import './reactcomponent.less'
import React from 'react'
import ReactDOM from 'react-dom'
// import Provider from 'views/provider'
// import {streamsStore, streamsActions, streamsDispatch} from 'stores/streams'
import {settingsStore, settingsActions} from 'stores/settings'
// import {composeStore, composeActions} from 'stores/compose'
// import {updaterStore, updaterActions} from 'stores/updater'
import {userStore, userActions} from 'stores/user'
import Debug from 'debug'
import injectTapEventPlugin from 'react-tap-event-plugin'
import {
    STREAMS_WINDOW_JS_LOADED,
    STREAMS_WINDOW_PREPARE_RELOAD,
    PING_RESOURCE_USAGE,
    PONG_RESOURCE_USAGE,
    SEND_IPC_TO_CHILD,
    WINDOW_NAVIGATE_WEBVIEW_BACK,
    WINDOW_NAVIGATE_WEBVIEW_FORWARD
} from 'shared/ipcEvents'
const { ipcRenderer, webFrame, remote } = window.nativeRequire('electron')

// Prevent zooming
webFrame.setZoomLevelLimits(1, 1)

// Prevent drag/drop
document.addEventListener('drop', (evt) => {
    if (evt.target.tagName !== 'IMPUT' && evt.target.type !== 'file') {
        evt.preventDefault()
        evt.stopPropagation()
    }
})
document.addEventListener('dragover', (evt) => {
    if (evt.target.tagName !== 'INPUT' && evt.target.type !== 'file') {
        evt.preventDefault()
        evt.stopPropagation()
    }
})

// Navigation
ipcRenderer.on(WINDOW_NAVIGATE_WEBVIEW_BACK, () => streamsDispatch.navigateBack())
ipcRenderer.on(WINDOW_NAVIGATE_WEBVIEW_FORWARD, () => streamsDispatch.navigateForward())
if (process.platform === 'darwin') {
  const mouseNavigator = new MouseNavigationDarwin(
    () => streamsDispatch.navigateBack(),
    () => streamsDispatch.navigateForward()
  )
  mouseNavigator.register()
  window.addEventListener('beforeunload', () => {
    mouseNavigator.unregister()
  })
}

// Load what we have in the db
userStore.getState()
userActions.load()
streamsStore.getState()
streamsActions.load()
settingsStore.getState()
settingsActions.load()
composeStore.getState()
composeActions.load()
updaterStore.getState()
updaterActions.load()
Debug.load()

// Remove loading
;(() => {
  const loading = document.getElementById('loading')
  loading.parentElement.removeChild(loading)
})()

// Render and prepare for unrender
injectTapEventPlugin()
ReactDOM.render(<Provider />, document.getElementById('ReactComponent-AppSceneRenderNode'))
ipcRenderer.on(STREAMS_WINDOW_PREPARE_RELOAD, () => {
  window.location.hash = '/'
})
window.addEventListener('beforeunload', () => {
  ReactDOM.unmountComponentAtNode(document.getElementById('ReactComponent-AppSceneRenderNode'))
})

ipcRenderer.send(STREAMS_WINDOW_JS_LOADED, {})

// Resource usage monitoring
ipcRenderer.on(PING_RESOURCE_USAGE, () => {
  ipcRenderer.send(PONG_RESOURCE_USAGE, {
    ...process.getCPUUsage(),
    ...process.getProcessMemoryInfo(),
    pid: process.pid,
    description: `Mailboxes Window`
  })
})

// Message passing
ipcRenderer.on(SEND_IPC_TO_CHILD, (evt, { id, channel, payload }) => {
  remote.webContents.fromId(id).send(channel, payload)
})
