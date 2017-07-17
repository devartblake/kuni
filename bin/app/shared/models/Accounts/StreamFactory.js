const STREAM_TYPES = require('./StreamTypes')
const MixerStream = require('./Mixer/MixerStream')
const GenericStream = require('./Generic/GenericStream')

class StreamFactory {
  /**
  * Gets the class for the relevant stream model
  * @param streamType: the type of stream
  * @return the correct class or undefined
  */
  static getClass (streamType) {
    switch (streamType) {
      case STREAM_TYPES.MIXER: return MixerStream
      case STREAM_TYPES.GENERIC: return GenericStream
    }
  }

  /**
  * Converts plain data into the relevant stream model
  * @param id: the id of the stream
  * @param data: the data for the stream
  * @return the stream or undefined
  */
  static modelize (id, data) {
    const ModelClass = this.getClass(data.type)
    if (ModelClass) {
      return new ModelClass(id, data)
    } else {
      return undefined
    }
  }
}

module.exports = StreamFactory