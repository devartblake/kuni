import React from 'react'
import ReactDOM from 'react-dom'
import Provider from 'views/Provider'
import browserActions from 'stores/browser/browserActions'
import injectTapEventPlugin from 'react-tap-event-plugin'
import querystring from 'querystring'
import {
  PING_RESOURCE_USAGE,
  PONG_RESOURCE_USAGE,
  SEND_IPC_TO_CHILD
} from 'shared/ipcEvents'

const { webFrame, ipcRenderer, remote } = window.nativeRequire('electron')

// Prevent zooming
webFrame.setZoomLevelLimits(1, 1)

// Prevent drag/drop
document.addEventListener('drop', (evt) => {
  if (evt.target.tagName !== 'INPUT' && evt.target.type !== 'file') {
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

// Load what we have in the db
browserActions.load()

// Parse our settings
const {
  url,
  partition
} = querystring.parse(window.location.search.slice(1))

// Render
injectTapEventPlugin()
ReactDOM.render((
  <Provider url={url} partition={partition} />
), document.getElementById('ReactComponent-AppScene'))

// Resource usage monitoring
ipcRenderer.on(PING_RESOURCE_USAGE, () => {
  ipcRenderer.send(PONG_RESOURCE_USAGE, {
    ...process.getCPUUsage(),
    ...process.getProcessMemoryInfo(),
    pid: process.pid,
    description: `Content Window: ${document.title}`
  })
  document.querySelector('webview').send(PING_RESOURCE_USAGE, {
    description: `Content WebView: ${document.title}`
  })
})

// Message passing
ipcRenderer.on(SEND_IPC_TO_CHILD, (evt, { id, channel, payload }) => {
  remote.webContents.fromId(id).send(channel, payload)
})