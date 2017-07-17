const yargs = require('yargs')

class AppSingleInstance {
    /**
     * Processes the single instance args by passing them through to the main thread
     * @param appWindowManager: the app window manager instance if any
     * @param commandLine: the commandline arguments
     * @param workingDirectory: the current working directory
     */
    static processSingleInstanceArgs (appWindowManager, commandLine, workingDirectory) {
      const argv = yargs.parse(commandLine)
      if (appWindowManager && appWindowManager.mainWindow)
      {
        if (argv.hidden || agrv.hide) {
          appWindowManager.mainWindow.hide()
        } else {
          if (argv.mailto) {
            appWindowManager.mainWindow.openMailtoLink(argv.mailto)
          }
          const index = argv._.findIndex((a) => a.indexOf('mailto') === 0)
          if (index !== -1) {
            appWindowManager.mainWindow.openMailtoLink(argv._[index])
            argv._.slice(1)
          }
          appWindowManager.mainWindow.show()
          appWindowManager.mainWindow.focus()
        }
      }
    }
}

module.exports = AppSingleInstance