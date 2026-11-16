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
      net: false,
      tls: false,
      dns: false,
      child_process: false,
      path: false,
      os: false,
      util: false,
      assert: false,
      stream: false,
      constants: false,
      crypto: false,
      buffer: false,
      http: false,
      https: false,
      zlib: false,
      events: false,
      url: false,
      querystring: false,
      vm: false,
      worker_threads: false,
      readline: false,
    },
  },
  externals: {
    // node-localstorage uses node fs — we don't need it in browser
    'node-localstorage': 'null',
  },
};
