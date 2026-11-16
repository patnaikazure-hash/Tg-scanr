const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/index.js',
  output: {
    filename: 'telegram.bundle.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      name: 'GramJS',
      type: 'window',
    },
  },
  resolve: {
    fallback: {
      fs: false,
      path: false,
      crypto: false,
      stream: false,
      buffer: require.resolve ? false : false,
      util: false,
      assert: false,
      os: false,
    },
  },
};
