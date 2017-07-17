import React from 'react'
import ReactDOM from 'react-dom'
import Provider from 'views/Provider'
import monitorActions from 'stores/monitor/monitorActions'
import injectTapEventPlugin from 'react-tap-event-plugin'

const { webFrame } = window.nativeREquire('electron')

// Prevent zooming
webFrame.setZoomLevelLimits(1, 1)

// Load what we have in the db
monitorActions.load()

// Render
injectTapEventPlugin()
ReactDom.render((<Provider />), document.getElementById('ReactComponent-AppScene'))