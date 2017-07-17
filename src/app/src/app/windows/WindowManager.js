const { app } = require('electron')
const settingStore = require('../stores/settingStore')
const {
  TraySettings: { SUPPORTS_TRAY_MINIMIZE_CONFIG }
} = require('../../shared/Models/Settings')
const MonitorWindow = require('./MonitorWindow')

class WindowManager {
  /* ****************************************************************************/
  // Lifecycle
  /* ****************************************************************************/

  /**
  * @param streamsWindow: the main window
  */
  constructor (streamsWindow) {
    this.contentWindows = []
    this.streamsWindow = null
    this.monitor = { window: null, ping: null, active: false }
    this.forceQuit = false
  }

  /**
  * Attaches a streams window
  * @param streamsWindow: the window to attach
  */
  attachStreamsWindow (streamsWindow) {
    if (this.streamsWindow) {
      throw new Error('Main window already attached')
    }
    this.streamsWindow = streamsWindow
    this.streamsWindow.on('close', (e) => this.handleClose(e))
    this.streamsWindow.on('closed', () => {
      this.streamsWindow = null
      app.quit()
    })
  }

  /* ****************************************************************************/
  // Events
  /* ****************************************************************************/

  /**
  * Handles the close event by trying to persist the Streams window
  * @param evt: the event that occured
  */
  handleClose (evt) {
    if (!this.forceQuit) {
      let hide = false
      if (SUPPORTS_TRAY_MINIMIZE_CONFIG) {
        if (settingStore.tray.show && settingStore.tray.hideWhenClosed) {
          hide = true
        }
      } else {
        if (process.platform === 'darwin' || settingStore.tray.show) {
          hide = true
        }
      }

      if (hide) {
        this.streamsWindow.hide()
        evt.preventDefault()
        this.forceQuit = false
      }
    }
  }

  /* ****************************************************************************/
  // Adding
  /* ****************************************************************************/

  /**
  * Adds a content window
  * @param window: the window to add
  * @return this
  */
  addContentWindow (window) {
    this.contentWindows.push(window)
    window.on('closed', () => {
      this.contentWindows = this.contentWindows.filter((w) => w !== window)
    })
    return this
  }

  /* ****************************************************************************/
  // Monitor Window
  /* ****************************************************************************/

  /**
  * Opens a monitor window, or if one already open does nothing
  * @return this
  */
  openMonitorWindow () {
    if (this.monitor.active) { return }

    this.monitor.window = new MonitorWindow()
    this.monitor.window.create()
    this.monitor.ping = setInterval(() => {
      this.contentWindows.forEach((w) => w.pingResourceUsage())
      this.streamsWindow.pingResourceUsage()
    }, 2000)

    this.monitor.window.on('closed', () => {
      clearInterval(this.monitor.ping)
      this.monitor.window = null
      this.monitor.active = false
    })

    this.monitor.active = true

    return this
  }

  /**
  * Sends resource info to the monitoring window
  */
  submitProcessResourceUsage (info) {
    if (this.monitor.active && this.monitor.window) {
      this.monitor.window.submitProcessResourceUsage(info)
    }
  }

  /* ****************************************************************************/
  // Actions
  /* ****************************************************************************/

  /**
  * Handles a quit by trying to keep the Streams window hidden
  */
  quit () {
    this.forceQuit = true
    this.streamsWindow.close()
  }

  /**
  * Focuses the next available window
  */
  focusNextWindow () {
    if (this.streamsWindow.isFocused()) {
      if (this.contentWindows.length) {
        this.contentWindows[0].focus()
      }
    } else {
      const focusedIndex = this.contentWindows.findIndex((w) => w.isFocused())
      if (focusedIndex === -1 || focusedIndex + 1 >= this.contentWindows.length) {
        this.streamsWindow.focus()
      } else {
        this.contentWindows[focusedIndex + 1].focus()
      }
    }
  }

  /**
  * Focuses the main main window and shows it if it's hidden
  */
  focusStreamsWindow () {
    if (this.focused() === this.streamsWindow) {
      return // If there's already a focused window, do nothing
    }

    if (!this.streamsWindow.isVisible()) {
      this.streamsWindow.show()
    }
    this.streamsWindow.focus()
  }

  /**
  * Toggles the main window visibility by hiding or showing the main windoww
  */
  toggleStreamWindowVisibilityFromTray () {
    if (process.platform === 'win32') {
      // On windows clicking on non-window elements (e.g. tray) causes window
      // to lose focus, so the window will never have focus
      if (this.streamsWindow.isVisible()) {
        this.streamsWindow.close()
      } else {
        this.streamsWindow.show()
        this.streamsWindow.focus()
      }
    } else {
      if (this.streamsWindow.isVisible()) {
        if (this.focused() === this.streamsWindow) {
          this.streamsWindow.hide()
        } else {
          this.streamsWindow.focus()
        }
      } else {
        this.streamsWindow.show()
        this.streamsWindow.focus()
      }
    }
  }

  /**
  * Shows and focuses the main window
  */
  showStreamWindowFromTray () {
    this.streamsWindow.show()
    this.streamsWindow.focus()
  }

  /* ****************************************************************************/
  // Querying
  /* ****************************************************************************/

  /**
  * @return the focused window
  */
  focused () {
    if (this.streamsWindow.isFocused()) {
      return this.streamsWindow
    } else {
      return this.contentWindows.find((w) => w.isFocused())
    }
  }

  /**
  * Gets the content windows with the given ownerId
  * @param ownerId: the id to get
  * @return a list of content windows with the specified owner id
  */
  getContentWindowsWithOwnerId (ownerId) {
    return this.contentWindows.filter((w) => w.ownerId === ownerId)
  }
}

module.exports = WindowManager