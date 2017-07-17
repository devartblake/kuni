window.startKuniClient = function () {
    require('./kuniClient')
    delete window.startKuniClient
}