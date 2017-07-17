const persistence = require('../storage/streamStorage')
const { EventEmitter } = require('events')
const StreamFactory = require('../../shared/Models/Accounts/streamFactory')
const { PERSISTENCE_INDEX_KEY } = require('../../shared/constants')
const { STREAM_STORAGE_CHANGE_ACTIVE } = require('../../shared/ipcEvents')
const { ipcMain } = require('electron')

class StreamStore extends EventEmitter {
  /* ****************************************************************************/
  // Lifecycle
  /* ****************************************************************************/

  constructor () {
    super()

    // Build the current data
    this.index = []
    this.streams = new Map()
    this.activeStreamId = null
    this.activeServiceType = null

    const allRawItems = persistence.allJSONItems()
    Object.keys(allRawItems).forEach((id) => {
      if (id === PERSISTENCE_INDEX_KEY) {
        this.index = allRawItems[id]
      } else {
        this.streams.set(id, StreamFactory.modelize(id, allRawItems[id]))
      }
    })

    // Listen for changes
    persistence.on('changed', (evt) => {
      if (evt.key === PERSISTENCE_INDEX_KEY) {
        this.index = persistence.getJSONItem(PERSISTENCE_INDEX_KEY)
      } else {
        if (evt.type === 'setItem') {
          this.streams.set(evt.key, StreamFactory.modelize(evt.key, persistence.getJSONItem(evt.key)))
        }
        if (evt.type === 'removeItem') {
          this.streams.delete(evt.key)
        }
      }
      this.emit('changed', {})
    })

    ipcMain.on(STREAM_STORAGE_CHANGE_ACTIVE, (evt, data) => {
      this.activeStreamId = data.streamId
      this.activeServiceType = data.serviceType
      this.emit('changed', {})
    })
  }

  checkAwake () { return true }

  /* ****************************************************************************/
  // Getters
  /* ****************************************************************************/

  /**
  * @return the stream in an ordered list
  */
  orderedStreams () {
    return this.index
      .map(id => this.streams.get(id))
      .filter((stream) => !!stream)
  }

  /**
  * @param id: the id of the stream
  * @return the stream record
  */
  getStream (id) { return this.streams.get(id) }

  /**
  * @return the id of the active stream
  */
  getActiveStreamId () { return this.activeStreamId || this.index[0] }

  /**
  * @return the active stream
  */
  getActiveStream () { return this.getStream(this.getActiveStreamId()) }

  /**
  * @return the type active service
  */
  getActiveServiceType () { return this.activeServiceType }

  /**
  * @param streamId: the id of the stream
  * @param serviceType: the type of service
  * @return the service for the stream or undefined if not available
  */
  getService (streamId, serviceType) {
    const stream = this.getStream(streamId)
    if (stream) {
      return stream.serviceForType(serviceType)
    } else {
      return undefined
    }
  }
}

module.exports = new StreamStore()