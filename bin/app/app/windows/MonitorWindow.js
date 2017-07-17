const KuniWindow = require('./KuniWindow')
const path = require('path')
const MONITOR_DIR = path.resolve(path.join(__dirname, '/../../../views/monitor'))
const { SUBMIT_PROCESS_RESOURCE_USAGE } = require('../../shared/ipcEvents')

class MonitorWindow extends KuniWindow {
  /* ****************************************************************************/
  // Creation
  /* ****************************************************************************/

  create (url, browserWindowPreferences = {}) {
    return super.create(`file://${path.join(MONITOR_DIR, 'monitor.html')}`, {
      title: 'Kuni Monitor',
      width: 660,
      height: 500
    })
  }

  /* ****************************************************************************/
  // Info
  /* ****************************************************************************/

  /**
  * Sends the resource usage to the monitor window
  * @param info: the info to send
  * @return this
  */
  submitProcessResourceUsage (info) {
    this.window.webContents.send(SUBMIT_PROCESS_RESOURCE_USAGE, info)
    return this
  }
}

module.exports = MonitorWindow