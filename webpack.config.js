const TASKS = {
    resources: require('./resources/webpack.config.js'),
    app: require('./src/app/webpack.config.js'),
    bridge: require('./src/views/bridge/webpack.config.js'),
    content: require('./src/views/content/webpack.config.js'),
    monitor: require('./src/views/monitor/webpack.config.js'),
    streams: require('./src/views/streams/webpack.config.js')
}

module.exports = function (env = {}) {
    // Production
    if (env.p || env.production) {
        console.log('[PRODUCTION BUILD]')
        process.env.NODE_ENV = 'production'
    } else {
        console.log('[DEVELOPMENT BUILD]')
    }

    // Cheap / expensive source maps
    if (env.fast) {
        console.log('[CHEAP SOURCEMAPS]')
        process.env.WEBPACK_DEVTOOL = 'eval-cheap-module-source-map'
    } else {
        console.log('[FULL SOURCEMAPS]')
    }

    // Tasks
     const taskInput  = env.task ? env.task : ['all']
     const taskNames = Array.isArray(taskInput) ? taskInput : [taskInput]

     // Prep tests
     if (taskNames.find((n) => n === 'all')) {
         return Object.keys(TASKS).map((k) => TASKS[k](env))
     } else {
         return taskNames.map((n) => TASKS[n](env))
     }
}