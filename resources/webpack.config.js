const path = require('path')
const ROOT_DIR = path.resolve(path.join(__dirname, '../'))
const BIN_DIR = path.join(ROOT_DIR, 'bin')
const devRequire = (n) => require(path.join(ROOT_DIR, 'node_modules', n))

const CleanWebpackPlugin = devRequire('clean-webpack-plugin')
const CopyWebpackPlugin = devRequire('copy-webpack-plugin')

module.exports = function (env) {
    return {
        entry: path.join(__dirname, '__.js'),
        output: {
            path: BIN_DIR,
            filename: '__.js'
        },
        plugins: [
            new CleanWebpackPlugin(['fonts', 'icons', 'images','animations', 'js', 'scss', 'audio', 'styles' ], {
                root: BIN_DIR,
                verbose: true,
                dry: false
            }),
            new CopyWebpackPlugin([
                { from: path.join(__dirname, 'animations'), to: 'resources/animations', force: true },
                { from: path.join(__dirname, 'fonts'), to: 'resources/fonts', force: true },
                { from: path.join(__dirname, 'icons'), to: 'resources/icons', force: true },
                { from: path.join(__dirname, 'images'), to: 'resources/images', force: true },
                { from: path.join(__dirname, 'js'), to: 'resources/js', force: true },
                { from: path.join(__dirname, 'scss'), to: 'resources/scss', force: true },
                { from: path.join(__dirname, 'audio'), to: 'resources/audio', force: true },
                { from: path.join(__dirname, 'styles'), to: 'resources/styles', force: true }
            ], {
                ignore: [ '.DS_Store' ]
            })
        ]
    }
}