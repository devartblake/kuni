const { Menu, shell, dialog } = require('electron')
const streamStore = require('./stores/streamStore')
const settingStore = require('./stores/settingStore')
const { GITHUB_URL, GITHUB_ISSUE_URL, WEB_URL, PRIVACY_URL } = require('../shared/constants')
const Release = require('../shared/release')
const pkg = require('../package.json')
const MenuTool = require('../shared/Electron/MenuTool')

class AppPrimaryMenu {
  /* ****************************************************************************/
  // Selectors
  /* ****************************************************************************/

  /**
  * Builds the selector index for the primary menu manager
  * @param windowManager: the window manager instance the callbacks can call into
  * @return the selectors map
  */
  static buildSelectors (windowManager) {
    return {
      fullQuit: () => {
        windowManager.quit()
      },
      closeWindow: () => {
        const focused = windowManager.focused()
        if (focused) { focused.close() }
      },
      showWindow: () => {
        windowManager.streamsWindow.show().focus()
      },
      fullscreenToggle: () => {
        const focused = windowManager.focused()
        if (focused) { focused.toggleFullscreen() }
      },
      sidebarToggle: () => {
        windowManager.streamsWindow.show().focus().toggleSidebar()
      },
      menuToggle: () => {
        windowManager.streamsWindow.show().focus().toggleAppMenu()
      },
      preferences: () => {
        windowManager.streamsWindow.show().focus().launchPreferences()
      },
      addAccount: () => {
        windowManager.streamsWindow.show().focus().addAccount()
      },
      composeMail: () => {
        windowManager.streamsWindow.show().focus().openMailtoLink('mailto://')
      },
      reload: () => {
        const focused = windowManager.focused()
        if (focused) { focused.reload() }
      },
      devTools: () => {
        const focused = windowManager.focused()
        if (focused) { focused.openDevTools() }
      },
      learnMoreGithub: () => { shell.openExternal(GITHUB_URL) },
      learnMore: () => { shell.openExternal(WEB_URL) },
      privacy: () => { shell.openExternal(PRIVACY_URL) },
      bugReport: () => { shell.openExternal(GITHUB_ISSUE_URL) },
      zoomIn: () => {
        const focused = windowManager.focused()
        if (focused) { focused.zoomIn() }
      },
      zoomOut: () => {
        const focused = windowManager.focused()
        if (focused) { focused.zoomOut() }
      },
      zoomReset: () => {
        const focused = windowManager.focused()
        if (focused) { focused.zoomReset() }
      },
      changeStream: (streamId, serviceType = undefined) => {
        windowManager.streamsWindow.show().focus().switchstream(streamId, serviceType)
      },
      changeStreamServiceToIndex: (index) => {
        windowManager.streamsWindow.show().focus().switchToServiceAtIndex(index)
      },
      prevStream: () => {
        windowManager.streamsWindow.show().focus().switchPrevstream()
      },
      nextStream: () => {
        windowManager.streamsWindow.show().focus().switchNextstream()
      },
      cycleWindows: () => { windowManager.focusNextWindow() },
      aboutDialog: () => {
        dialog.showMessageBox({
          title: pkg.name,
          message: pkg.name,
          detail: [
            Release.generatedVersionString(pkg, '\n'),
            'Made with ♥ at wavebox.io'
          ].filter((l) => !!l).join('\n'),
          buttons: [ 'Done', 'Website' ]
        }, (index) => {
          if (index === 1) {
            shell.openExternal(WEB_URL)
          }
        })
      },
      checkForUpdate: () => {
        windowManager.streamsWindow.show().focus().userCheckForUpdate()
      },
      find: () => {
        const focused = windowManager.focused()
        if (focused) { focused.findStart() }
      },
      findNext: () => {
        const focused = windowManager.focused()
        if (focused) { focused.findNext() }
      },
      streamNavBack: () => {
        const focused = windowManager.focused()
        if (focused) { focused.navigateBack() }
      },
      streamNavForward: () => {
        const focused = windowManager.focused()
        if (focused) { focused.navigateForward() }
      }
    }
  }

  /* ****************************************************************************/
  // Lifecycle
  /* ****************************************************************************/

  constructor (selectors) {
    this._selectors = selectors
    this._lastAccelerators = null
    this._lastStreams = null
    this._lastActiveStream = null
    this._lastActiveServiceType = null
    this._lastMenu = null

    streamStore.on('changed', () => {
      this.handleStreamChanged()
    })
    settingStore.on('changed:accelerators', (evt) => {
      this.handleAcceleratorsChanged(evt)
    })
  }

  /* ****************************************************************************/
  // Creating
  /* ****************************************************************************/

  /**
  * Builds the menu
  * @param accelerators: the accelerators to use
  * @param streams: the list of streams
  * @param activestream: the active stream
  * @param activeServiceType: the type of the active service
  * @return the new menu
  */
  build (accelerators, streams, activeStream, activeServiceType) {
    return Menu.buildFromTemplate([
      {
        label: process.platform === 'darwin' ? 'Application' : 'File',
        submenu: [
          {
            label: 'About',
            click: this._selectors.aboutDialog
          },
          {
            label: 'Check for Update',
            click: this._selectors.checkForUpdate
          },
          { type: 'separator' },
          {
            label: 'Add Account',
            click: this._selectors.addAccount
          },
          {
            label: 'Preferences',
            click: this._selectors.preferences,
            accelerator: accelerators.preferences
          },
          { type: 'separator' },
          {
            label: 'Compose Mail',
            click: this._selectors.composeMail,
            accelerator: accelerators.composeMail
          },
          { type: 'separator' },
          process.platform === 'darwin' ? { label: 'Services', role: 'services', submenu: [] } : undefined,
          process.platform === 'darwin' ? { type: 'separator' } : undefined,
          {
            label: 'Show Window',
            click: this._selectors.showWindow,
            accelerator: accelerators.showWindow
          },
          {
            label: 'Hide Window',
            click: this._selectors.closeWindow,
            accelerator: accelerators.hideWindow
          },
          {
            label: 'Hide',
            role: 'hide',
            accelerator: accelerators.hide
          },
          {
            label: 'Hide Others',
            role: 'hideothers',
            accelerator: accelerators.hideOthers
          },
          {
            label: 'Show All',
            role: 'unhide'
          },
          { type: 'separator' },
          {
            label: 'Quit',
            click: this._selectors.fullQuit,
            accelerator: accelerators.quit
          }
        ].filter((item) => item !== undefined)
      },
      {
        label: 'Edit',
        submenu: [
          {
            label: 'Undo',
            role: 'undo',
            accelerator: accelerators.undo
          },
          {
            label: 'Redo',
            role: 'redo',
            accelerator: accelerators.redo
          },
          { type: 'separator' },
          {
            label: 'Cut',
            role: 'cut',
            accelerator: accelerators.cut
          },
          {
            label: 'Copy',
            role: 'copy',
            accelerator: accelerators.copy
          },
          {
            label: 'Paste',
            role: 'paste',
            accelerator: accelerators.paste
          },
          {
            label: 'Paste and match style',
            role: 'pasteandmatchstyle',
            accelerator: accelerators.pasteAndMatchStyle
          },
          {
            label: 'Select All',
            role: 'selectall',
            accelerator: accelerators.selectAll
          },
          { type: 'separator' },
          {
            label: 'Find',
            click: this._selectors.find,
            accelerator: accelerators.find
          },
          {
            label: 'Find Next',
            click: this._selectors.findNext,
            accelerator: accelerators.findNext
          }
        ]
      },
      {
        label: 'View',
        submenu: [
          {
            label: 'Toggle Full Screen',
            click: this._selectors.fullscreenToggle,
            accelerator: accelerators.toggleFullscreen
          },
          {
            label: 'Toggle Sidebar',
            click: this._selectors.sidebarToggle,
            accelerator: accelerators.toggleSidebar
          },
          process.platform === 'darwin' ? undefined : {
            label: 'Toggle Menu',
            click: this._selectors.menuToggle,
            accelerator: accelerators.toggleMenu
          },
          { type: 'separator' },
          {
            label: 'Navigate Back',
            click: this._selectors.streamNavBack,
            accelerator: accelerators.navigateBack
          },
          {
            label: 'Navigate Forward',
            click: this._selectors.streamNavForward,
            accelerator: accelerators.navigateForward
          },
          { type: 'separator' },
          {
            label: 'Zoom In',
            click: this._selectors.zoomIn,
            accelerator: accelerators.zoomIn
          },
          {
            label: 'Zoom Out',
            click: this._selectors.zoomOut,
            accelerator: accelerators.zoomOut
          },
          {
            label: 'Reset Zoom',
            click: this._selectors.zoomReset,
            accelerator: accelerators.zoomReset
          },
          { type: 'separator' },
          {
            label: 'Reload',
            click: this._selectors.reload,
            accelerator: accelerators.reload
          },
          {
            label: 'Developer Tools',
            click: this._selectors.devTools,
            accelerator: accelerators.developerTools
          }
        ].filter((item) => item !== undefined)
      },
      {
        label: 'Window',
        role: 'window',
        submenu: [
          {
            label: 'Minimize',
            role: 'minimize',
            accelerator: accelerators.minimize
          },
          {
            label: 'Cycle Windows',
            click: this._selectors.cycleWindows,
            accelerator: accelerators.cycleWindows
          }
        ]
        .concat(streams.length <= 1 ? [] : [
          { type: 'separator' },
          {
            label: 'Previous Stream',
            click: this._selectors.prevStream,
            accelerator: accelerators.previousStream
          },
          {
            label: 'Next Stream',
            click: this._selectors.nextStream,
            accelerator: accelerators.nextStream
          }
        ])
        .concat(streams.length <= 1 ? [] : [{ type: 'separator' }])
        .concat(streams.length <= 1 ? [] : streams.map((stream, index) => {
          return {
            label: stream.displayName || 'Untitled',
            type: 'radio',
            checked: stream.id === (activeStream || {}).id,
            click: () => { this._selectors.changeStream(stream.id) },
            accelerator: this.buildAcceleratorStringForIndex(accelerators.streamIndex, index)
          }
        }))
        .concat(activeStream && activeStream.hasAdditionalServices ? [{ type: 'separator' }] : [])
        .concat(activeStream && activeStream.hasAdditionalServices ? activeStream.enabledServices.map((service, index) => {
          return {
            label: service.humanizedType,
            type: 'radio',
            checked: service.type === activeServiceType,
            click: () => { this._selectors.changeStream(activeStream.id, service.type) },
            accelerator: this.buildAcceleratorStringForIndex(accelerators.serviceIndex, index)
          }
        }) : [])
      },
      {
        label: 'Help',
        role: 'help',
        submenu: [
          { label: 'Kuni Website', click: this._selectors.learnMore },
          { label: 'Privacy', click: this._selectors.privacy },
          { label: 'Kuni on GitHub', click: this._selectors.learnMoreGithub },
          { label: 'Report a Bug', click: this._selectors.bugReport }
        ]
      }
    ])
  }

  /**
  * Builds an accelerator string from a descriptor but with a rolling index value
  * @param accelerator: the accelerator descriptor to use
  * @param index: the index of the item to use in an array. This will be +1'ed and top & tailed
  * @return a string that can be used with electron
  */
  buildAcceleratorStringForIndex (accelerator, index) {
    if (index < 0 || index > 9) {
      return undefined
    } else {
      return (accelerator || '').replace('Number', index + 1)
    }
  }

  /**
  * Builds and applies the streams menu
  * @param accelerators: the accelerators to use
  * @param streams: the current list of streams
  * @param activeStream: the active stream
  * @param activeServiceType: the type of active service
  */
  updateApplicationMenu (accelerators, streams, activeStream, activeServiceType) {
    this._lastAccelerators = accelerators
    this._lastActiveStream = activeStream
    this._lastActiveServiceType = activeServiceType
    this._laststream = streams

    // Prevent Memory leak
    const lastMenu = this._lastMenu
    this._lastMenu = this.build(accelerators, streams, activeStream, activeServiceType)
    Menu.setApplicationMenu(this._lastMenu)
    if (lastMenu) {
      MenuTool.fullDestroyMenu(lastMenu)
    }
  }

  /* ****************************************************************************/
  // Change events
  /* ****************************************************************************/

  /**
  * Handles the stream changing
  */
  handlestreamChanged () {
    const activeStream = streamStore.getActiveStream()
    const activeServiceType = streamStore.getActiveServiceType()
    const streams = streamStore.orderedStreams()

    // Munge our states for easier comparison
    const props = [
      [(this._lastActiveStream || {}).id, (activeStream || {}).id],
      [this._lastActiveServiceType, activeServiceType],
      [
        (this._lastStreams || []).map((m) => m.displayName + ';' + m.enabledServiceTypes.join(';')).join('|'),
        streams.map((m) => m.displayName + ';' + m.enabledServiceTypes.join(';')).join('|')
      ]
    ]

    // Check for change
    const changed = props.findIndex(([prev, next]) => prev !== next) !== -1
    if (changed) {
      this.updateApplicationMenu(this._lastAccelerators, streams, activeStream, activeServiceType)
    }
  }

  /**
  * Handles the accelerators changing. If these change it will definately have a reflection in the
  * menu, so just update immediately
  */
  handleAcceleratorsChanged ({ next }) {
    this.updateApplicationMenu(next, this._lastStreams, this._lastActiveStream, this._lastActiveServiceType)
  }
}

module.exports = AppPrimaryMenu