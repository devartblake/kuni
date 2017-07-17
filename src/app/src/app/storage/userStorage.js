const uuid = require('uuid')
const StorageContainer = require('./StorageContainer')
const { CLIENT_ID, ANALYTICS_ID, CREATED_TIME } = require('../../shared/Models/DeviceKeys')
const storageContainer = new StorageContainer('user')

if (storageContainer.getItem(CLIENT_ID) === undefined) {
  storageContainer._setItem(CLIENT_ID, JSON.stringify(uuid.v4()))
}
if (storageContainer.getItem(ANALYTICS_ID) === undefined) {
  storageContainer._setItem(ANALYTICS_ID, JSON.stringify(uuid.v4()))
}
if (storageContainer.getItem(CREATED_TIME) === undefined) {
  storageContainer._setItem(CREATED_TIME, JSON.stringify(new Date().getTime()))
}

module.exports = storageContainer