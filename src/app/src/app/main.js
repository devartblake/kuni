;(function () {

'use strict'
process.env.NODE_ENV = process.env.NODE_ENV || 'production'

const { ipcMain, app } = require('electron')
const AppUpdater = require('./AppUpdater')

// Squirrel startup calls
if (AppUpdater.handleWin32SquirrelSwitches(app)) { return }

// Single app instance
let appWindowManager
const singleAppQuit = app.makeSingleInstance(function (commangLine, workingDirectory) {
  const AppSingleInstance = require('./AppSingleInstance')
  AppSingleInstance.processSingleInstanceArgs(appWindowManager, commandLine, workingDirectory)
  return true
})
if (singleAppQuit) { app.quit(); return }

// Setup the window manager
appWindowManager = require('./appWindowManager')
const StreamsWindow = require('./windows/streamsWindow')
appWindowManager.attachStreamsWindow(new StreamsWindow())

// Startup
const argv = require('yargs').parse(process.argv)
const AppPrimaryMenu = require('./AppPrimaryMenu')
const AppGlobalShortcuts = require('./AppGlobalShortcuts')
const storage = require('./storage')
const settingStore = require('./stores/settingStore')
const streamStore = require('./stores/streamStore')
const userStore = require('./stores/userStore')
const ipcEvents = require('../shared/ipcEvents')

const path = require('path')
const fs = require('fs')
const url = require('url')
const glob = require('glob')
const electron = require('electron')
const GhReleases = require('electron-gh-releases')
const { BrowserWindow , nativeImage} = require('electron')
const crashReporter = electron.crashReporter

// Interactive handler
//const mixerConnect = require('../../../core/lib/interactive/mixer-interactive');

const debug = /--debug/.test(process.argv[2])
require('dotenv').config()

if (process.mas) app.setName('Electron APIs')

let mainWindow = null
// Global var for main window
global.renderWindow = mainWindow

Object.keys(storage).forEach((k) => storage[k].checkAwake())
streamStore.checkAwake()
settingStore.checkAwake()
userStore.checkAwake()

// App Information

/* ****************************************************************************/
  // Commandline switches & launch args
  /* ****************************************************************************/

  if (settingStore.app.ignoreGPUBlacklist) {
    app.commandLine.appendSwitch('ignore-gpu-blacklist', 'true')
  }
  if (settingStore.app.disableSmoothScrolling) {
    app.commandLine.appendSwitch('disable-smooth-scrolling', 'true')
  }
  if (!settingStore.app.enableUseZoomForDSF) {
    app.commandLine.appendSwitch('enable-use-zoom-for-dsf', 'false')
  }

  /* ****************************************************************************/
  // Global objects
  /* ****************************************************************************/

  const shortcutSelectors = AppPrimaryMenu.buildSelectors(appWindowManager)
  const appMenu = new AppPrimaryMenu(shortcutSelectors)
  const appGlobalShortcutSelectors = AppGlobalShortcuts.buildSelectors(appWindowManager)
  const appGlobalShortcuts = new AppGlobalShortcuts(appGlobalShortcutSelectors)

  /* ****************************************************************************/
  // IPC Events
  /* ****************************************************************************/

  ipcMain.on(ipcEvents.OPEN_MONITOR_WINDOW, (evt, body) => {
    appWindowManager.openMonitorWindow()
  })

  ipcMain.on(ipcEvents.PONG_RESOURCE_USAGE, (evt, body) => {
    appWindowManager.submitProcessResourceUsage(body)
  })

  ipcMain.on(ipcEvents.FOCUS_APP, (evt, body) => {
    appWindowManager.focusMailboxesWindow()
  })

  ipcMain.on(ipcEvents.TOGGLE_STREAM_WINDOW_FROM_TRAY, (evt, body) => {
    appWindowManager.toggleStreamWindowVisibilityFromTray()
  })

  ipcMain.on(ipcEvents.SHOW_APP_WINDOW_FROM_TRAY, (evt, body) => {
    appWindowManager.showStreamWindowFromTray()
  })

  ipcMain.on(ipcEvents.QUIT_APP, (evt, body) => {
    appWindowManager.quit()
  })

  ipcMain.on(ipcEvents.RELAUNCH_APP, (evt, body) => {
    app.relaunch()
    appWindowManager.quit()
  })

  ipcMain.on(ipcEvents.SQUIRREL_UPDATE_CHECK, (evt, data) => {
    AppUpdater.updateCheck(data.url)
  })

  ipcMain.on(ipcEvents.SQUIRREL_APPLY_UPDATE, (evt, body) => {
    AppUpdater.applySquirrelUpdate(appWindowManager)
  })

  ipcMain.on(ipcEvents.PREPARE_STREAM_SESSION, (evt, data) => {
    appWindowManager.streamsWindow.sessionManager.startManagingSession(data.partition, data.mailboxType)
    evt.returnValue = true
  })
  ipcMain.on(ipcEvents.PREPARE_EXTENSION_SESSION, (evt, data) => {
    HostedExtensions.HostedExtensionSessionManager.startManagingSession(data.partition)
    evt.returnValue = true
  })

  ipcMain.on(ipcEvents.STREAMS_WINDOW_JS_LOADED, (evt, data) => {
    if (argv.mailto) {
      appWindowManager.streamsWindow.openMailtoLink(argv.mailto)
      delete argv.mailto
    } else {
      const index = argv._.findIndex((a) => a.indexOf('mailto') === 0)
      if (index !== -1) {
        appWindowManager.streamsWindow.openMailtoLink(argv._[index])
        argv._.splice(1)
      }
    }
  })

  ipcMain.on(ipcEvents.PROVISION_EXTENSION, (evt, data) => {
    ContentExtensions.provisionExtension(data.requestUrl, data.loadKey, data.apiKey, data.protocol, data.src, data.data)
    if (data.reply) {
      if (evt.sender.hostWebContents) {
        evt.sender.hostWebContents.send(ipcEvents.SEND_IPC_TO_CHILD, {
          id: evt.sender.id,
          channel: data.reply,
          payload: { ok: true }
        })
      } else {
        evt.sender.send(data.reply, { ok: true })
      }
    }
  })

crashReporter.start({
  productName: 'Kuni Interactive Bot',
  companyName: 'Theoretical Minds',
  submitURL: '',
  autoSubmit: true
})

if(process.env.NODE_ENV === 'development') {
  require('electron-deug')()
}

  function createWindow () {
    var windowOptions = {
      width: 1024,
      minWidth: 640,
      height: 840,
      minHeight: 720,
      title: app.getName()
    }

    if (process.platform === 'linux') {
      windowOptions.icon = path.join('file://', __dirname, '/assets/app-icon/png/512.png')
    }

    // mainWindow = new BrowserWindow(windowOptions)
    // mainWindow.loadURL(path.join(__dirname, '/index.html'))

    // Launch fullscreen with DevTools open, usage: npm run debug
    if (debug) {
      mainWindow.webContents.openDevTools()
      mainWindow.maximize()
      require('devtron').install()
    }

    mainWindow.on('closed', function () {
      mainWindow = null
    })
      
    mainWindow.on('focus', () => {
      mainWindow.webContents.send('browser-window-focus')
    })

    mainWindow.on('blur', () => {
      mainWindow.webContents.send('browser-window-blur')
    })

    // Register the kill switch
    //mixerConnect.shortcut();
  }

  function pathExists(path) {
    fs.access(path, (err) => {
      if(err) {
        //ENONENT means Error NO ENTity found, aka the folder doesn't exist.
        if(err.code === 'ENOENT'){
          return false;
        }
      }
    })
    return true;
  }

  /* ****************************************************************************/
  // App Events
  /* ****************************************************************************/

  app.on('ready', () => {
    // Doing this outside of ready has a side effect
    // To resolve this, run it when in ready
    const openHidden = (function () {
      if (settingStore.ui.openHidden) { return true }
      if (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAsHidden) { return true }
      if (argv.hidden || argv.hide) { return true }
      return false
    })()

    appMenu.updateApplicationMenu(
      settingStore.accelerators,
      streamStore.orderedStreams(),
      streamStore.getActiveStream(),
      streamStore.getActiveServiceType()
    )
    appWindowManager.streamsWindow.create(openHidden)
    AppUpdater.register(appWindowManager)
    appGlobalShortcuts.register()

    // Create the user-settings folder if it doesn't exist. It's required 
    // for the folders below that are within it
    if(!pathExists("./user-settings/")) {
      console.log("Can't find the user-settings folder, creating one now...");
      fs.mkdir("./user-settings");
    }
      
    // Create the scripts folder if it doesn't exist
    if(!pathExists("./user-settings/scripts/")) {
      console.log("Can't find the scripts folder, creating one now...");
      fs.mkdir("./user-settings/scripts");
    }
    
    // Create the overlay settings folder if it doesn't exist.
    if(!pathExists("./user-settings/overlay-settings/")) {
      console.log("Can't find the overlay-settings folder, creating one now...");
      fs.mkdir("./user-settings/overlay-settings");
    }  
    
    // Create the port.js file if it doesn't exist.
    if(!pathExists("./user-settings/overlay-settings/port.js")) {
      // Save the default port file
      fs.writeFile('./user-settings/overlay-settings/port.js', `window.WEBSOCKET_PORT = 8080`, 
        'utf8', () => { console.log(`Set overlay port to: 8080`)});
    }
 
  })

    app.on('window-all-closed', () => {      
      app.quit()      
    })

    app.on('activate', () => {
      appWindowManager.streamsWindow.show()
    })
    
    app.on('before-quit', () => {
      appGlobalShortcuts.unregister()
      appWindowManager.forceQuit = true
      //mixerConnect.shortcutUnregister();
    })
   
  /* ****************************************************************************/
  // Exceptions
  /* ****************************************************************************/

  // Send crash reports
  process.on('uncaughtException', (err) => {
    console.error(err)
    console.error(err.stack)
  })

})()