'use strict'
process.env.NODE_ENV = process.env.NODE_ENV || 'production'

const path = require('path')
const fs = require('fs')
const url = require('url')
const glob = require('glob')
const electron = require('electron')
const autoUpdater = require('./auto-updater')
const GhReleases = require('electron-gh-releases')

const BrowserWindow = electron.BrowserWindow
const crashReporter = electron.crashReporter
const nativeImage = electron.nativeImage
const ipcMain = electron.ipcMain
const app = electron.app
// Interactive handler
const mixerConnect = require('./core/lib/interactive/mixer-interactive');

const debug = /--debug/.test(process.argv[2])
require('dotenv').config()

if (process.mas) app.setName('Electron APIs')

let mainWindow = null
// Global var for main window
global.renderWindow = mainWindow


const appVersion = require('./package.json').version
const productName = require('./package.json').build.productName
const copyRight = require('./package.json').build.copyright
const options = {repo: 'devartblake/Kuni', currentVersion: appVersion}
const updater = new GhReleases(options)
console.log("Version: " + appVersion)
console.log("Product Name: " + productName)
console.log("Copyright: " + copyRight)

crashReporter.start({
  productName: 'Kuni Interactive Bot',
  companyName: 'Theoretical Minds',
  submitURL: '',
  autoSubmit: true
})

if(process.env.NODE_ENV === 'development') {
  require('electron-deug')()
}
function initialize () {
  var shouldQuit = makeSingleInstance()
  if (shouldQuit) return app.quit()

  loadDemos()

const utilsPath = process.env.NODE_ENV === 'development' ? './core' : './core'
const requirePath = process.env.NODE_ENV === 'development' ? './core' : './core'

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

    mainWindow = new BrowserWindow(windowOptions)
    mainWindow.loadURL(url.format({ pathname: path.join(__dirname, '/index.html'), protocol: 'file', slashes: true}))

    // Launch fullscreen with DevTools open, usage: npm run debug
    if (debug) {
      mainWindow.webContents.openDevTools()
      mainWindow.maximize()
      require('devtron').install()
    }

    // Load IPC handler
    require(utilsPath + '/utils/ipcHandler')

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
    mixerConnect.shortcut();
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

  app.on('ready', () => {

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

    createWindow()
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.show();
    });

    autoUpdater.initialize()
  })

  const windowsEvents = require(requirePath + '/squirrel/WindowsEvents')
  if(windowsEvents.handleStartup(app)) {
    return
  }

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow()
    }
  })
}

// Uncaught Exceptions
process.on('uncaughtException', function(error) {
  // Handle the error
  console.error(error);
});

// When quiting
app.on('will-quit', () => {
  // Unregister all shortcuts.
  mixerConnect.shortcutUnregister();
});

// Make this app a single instance app.
//
// The main window will be restored and focused instead of a second window
// opened when a person attempts to launch a second instance.
//
// Returns true if the current version of the app should quit instead of
// launching.
function makeSingleInstance () {
  if (process.mas) return false

  return app.makeSingleInstance(function () {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// Require each JS file in the main-process dir
function loadDemos () {
  var files = glob.sync(path.join(__dirname, 'main-process/**/*.js'))
  files.forEach(function (file) {
    require(file)
  })
  autoUpdater.updateMenu()
}

// Handle Squirrel on Windows startup events
switch (process.argv[1]) {
  case '--squirrel-install':
    autoUpdater.createShortcut(function () { app.quit() })
    break
  case '--squirrel-uninstall':
    autoUpdater.removeShortcut(function () { app.quit() })
    break
  case '--squirrel-obsolete':
  case '--squirrel-updated':
    app.quit()
    break
  default:
    initialize()
}