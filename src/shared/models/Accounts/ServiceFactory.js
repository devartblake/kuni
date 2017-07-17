const STREAM_TYPES = require('./StreamTypes')
const SERVICE_TYPES = require('./ServiceTypes')

const MixerDefaultService = require('./Mixer/MixerDefaultService')
const GenericDefaultService = require('./Generic/GenericDefaultService')

class ServiceFactory {
  /**
  * Gets the class for the relevant service model
  * @param streamType: the type of stream
  * @param serviceType: the type of service
  * @return the correct class or undefined
  */
  static getClass (streamType, serviceType) {
    switch (streamType + ':' + serviceType) {
      // Trello
      case STREAM_TYPES.MIXER + ':' + SERVICE_TYPES.DEFAULT: return MixerDefaultService
      
      // Generic
      case STREAM_TYPES.GENERIC + ':' + SERVICE_TYPES.DEFAULT: return GenericDefaultService
    }
  }

  /**
  * Converts plain data into the relevant service model
  * @param streamId: the id of the stream
  * @param streamType: the type of stream
  * @param data: the data for the stream
  * @param metadata={}: the metadata for this service
  * @return the service or undefined
  */
  static modelize (streamId, streamType, data, metadata = {}) {
    const ModelClass = this.getClass(streamType, data.type)
    if (ModelClass) {
      return new ModelClass(streamId, data, metadata)
    } else {
      return undefined
    }
  }
}

module.exports = ServiceFactory