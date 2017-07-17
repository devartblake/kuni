const Registry = require('winreg')

class Win32Registry {
  /**
  * @param exePath: the path to the exe
  * @return the installer manifest
  */
  static manifest (exePath) {
    return [
      {
        path: '\\SOFTWARE\\Classes\\Kuni.Url.mailto',
        name: 'FriendlyTypeName',
        value: 'Kuni Url'
      },
      {
        path: '\\SOFTWARE\\Classes\\Kuni.Url.mailto\\shell\\open\\command',
        name: '',
        value: `${exePath} %1`
      },
      {
        path: '\\SOFTWARE\\Clients\\Mail\\Kuni',
        name: '',
        value: 'Kuni'
      },
      {
        path: '\\SOFTWARE\\Clients\\Mail\\Kuni',
        name: 'LocalizedString',
        value: `${exePath},-123`
      },
      {
        path: '\\SOFTWARE\\Clients\\Mail\\Kuni\\DefaultIcon',
        name: '',
        value: `${exePath},1`
      },
      {
        path: '\\SOFTWARE\\Clients\\Mail\\Kuni\\Capabilities',
        name: 'ApplicationName',
        value: 'Kuni'
      },
      {
        path: '\\SOFTWARE\\Clients\\Mail\\Kuni\\Capabilities',
        name: 'ApplicationDescription',
        value: 'All your web communication tools together for faster, smarter working'
      },
      {
        path: '\\SOFTWARE\\Clients\\Mail\\Kuni\\Capabilities\\StartMenu',
        name: 'Mail',
        value: 'Kuni'
      },
      {
        path: '\\SOFTWARE\\Clients\\Mail\\Kuni\\Capabilities\\URLAssociations',
        name: 'mailto',
        value: 'Kuni.Url.mailto'
      },
      {
        path: '\\SOFTWARE\\Clients\\Mail\\Kuni\\Protocols\\mailto',
        name: '',
        value: 'URL:MailTo Protocol'
      },
      {
        path: '\\SOFTWARE\\Clients\\Mail\\Kuni\\Protocols\\DefaultIcon',
        name: '',
        value: `${exePath},1`
      },
      {
        path: '\\SOFTWARE\\Clients\\Mail\\Kuni\\Protocols\\mailto\\shell\\open\\command',
        name: '',
        value: `${exePath} %1`
      },
      {
        path: '\\SOFTWARE\\Clients\\Mail\\Kuni\\shell\\open\\command',
        name: '',
        value: `${exePath}`
      },
      {
        path: '\\SOFTWARE\\RegisteredApplications',
        name: 'Kuni',
        value: 'Software\\Clients\\Mail\\Kuni\\Capabilities'
      }
    ]
  }

  /**
  * Adds the manifest entries
  * @param execPath: the path to the exe
  * @return promise
  */
  static addManifestEntries (execPath) {
    return this.manifest(execPath).reduce((acc, item) => {
      return acc.then(() => {
        return new Promise((resolve, reject) => {
          const key = new Registry({ hive: Registry.HKCU, key: item.path })
          key.set(item.name, Registry.REG_SZ, item.value, (err) => {
            err ? reject(err) : resolve()
          })
        })
      })
    }, Promise.resolve())
  }

  /**
  * Removes the manifest entries
  * @param execPath: the path to the exe
  * @param skipErrors=true: false to reject() on the first error
  * @return promise
  */
  static removeManifestEntries (execPath, skipErrors = true) {
    return this.manifest(execPath).reduce((acc, item) => {
      return acc.then(() => {
        return new Promise((resolve, reject) => {
          const key = new Registry({ hive: Registry.HKCU, key: item.path })
          key.remove(item.name, (err) => {
            err && skipErrors === false ? reject(err) : resolve()
          })
        })
      })
    }, Promise.resolve())
  }
}

module.exports = Win32Registry