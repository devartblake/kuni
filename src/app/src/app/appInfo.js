const appVersion = require('./package.json').version
const productName = require('./package.json').build.productName
const copyRight = require('./package.json').build.copyright
const options = {repo: 'devartblake/Kuni', currentVersion: appVersion}
const updater = new GhReleases(options)
console.log("Version: " + appVersion)
console.log("Product Name: " + productName)
console.log("Copyright: " + copyRight)