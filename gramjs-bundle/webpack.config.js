const path    = require('path');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  entry: './src/index.js',
  output: {
    filename: 'telegram.bundle.js',
    path: path.resolve(__dirname, 'dist'),
    globalObject: 'window',
    library: {
      name: 'GramJS',
      type: 'window',   // explicit window.GramJS = exports (robust in WebView)
    },
  },
  resolve: {
    fallback: {
      // ── Real polyfills (GramJS calls these at runtime) ───
      buffer:        require.resolve('buffer/'),
      events:        require.resolve('events/'),
      stream:        require.resolve('stream-browserify'),
      crypto:        require.resolve('crypto-browserify'),
      util:          require.resolve('util/'),                 // util.inspect.custom
      os:            require.resolve('os-browserify/browser'), // os.type()/os.release() for device model
      path:          require.resolve('path-browserify'),
      url:           require.resolve('url/'),
      assert:        require.resolve('assert/'),
      querystring:   require.resolve('querystring-es3'),
      // ── Stubbed (unused in a WebView; browser uses WebSocket/fetch/pako) ──
      fs:            false,
      net:           false,
      tls:           false,
      dns:           false,
      child_process: false,
      constants:     false,
      http:          false,
      https:         false,
      zlib:          false,
      vm:            false,
      worker_threads:false,
      readline:      false,
    },
  },
  plugins: [
    // Auto-inject Buffer global — many GramJS modules use it directly
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    }),
  ],
};
