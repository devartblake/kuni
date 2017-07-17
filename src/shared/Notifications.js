const NOTIFICATION_PROVIDERS = Object.freeze({
    ELECTRON: 'ELECTRON',
    ENHANCED: 'ENHANCED'
})

const NOTIFICAION_SOUNDS_WIN32 = Object.freeze({
    'ms-winsoundevent:Notification.Default': 'Default',
    'ms-winsoundevent:Notification.Message': 'Message',
    'ms-winsoundevent:Notification.Reminder': 'Reminder',
    'ms-winsoundevent:Notification.Follow': 'Follow',
    'ms-winsoundevent:Notification.Subscriber': 'Subscriber',
})
const DEFAULT_NOTIFICAION_SOUNDS_WIN32 = 'ms-winsoundevent:Notification.Default'

module.exports = {
    
  NOTIFICATION_PROVIDERS: NOTIFICATION_PROVIDERS,
  DEFAULT_NOTIFICATION_PROVIDER: NOTIFICATION_PROVIDERS.ELECTRON,

  NOTIFICAION_SOUNDS_WIN32: NOTIFICAION_SOUNDS_WIN32,
  DEFAULT_NOTIFICAION_SOUNDS_WIN32: DEFAULT_NOTIFICAION_SOUNDS_WIN32,

  NOTIFICATION_SOUNDS: (() => {
    switch (process.platform) {
      case 'win32': return NOTIFICAION_SOUNDS_WIN32
      default: return {}
    }
  })(),
  DEFAULT_NOTIFICATION_SOUND: (() => {
    switch (process.platform) {
      case 'win32': return DEFAULT_NOTIFICAION_SOUNDS_WIN32
      default: return undefined
    }
  })()
}