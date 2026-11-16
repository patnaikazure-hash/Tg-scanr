const path    = require('path');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  entry: './src/index.js',
  output: {
    filename: 'telegram.bundle.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      name: 'GramJS',
      type: 'var',
    },
  },
  resolve: {
    fallback: {
      // ── Polyfilled (GramJS needs these) ──────────────────
      buffer:        require.resolve('buffer/'),
      events:        require.resolve('events/'),
      stream:        require.resolve('stream-browserify'),
      // ── Stubbed (not needed in WebView) ─────────────────
      fs:            false,
      net:           false,
      tls:           false,
      dns:           false,
      child_process: false,
      path:          false,
      os:            false,
      util:          false,
      assert:        false,
      constants:     false,
      crypto:        false,   // Android WebView has window.crypto natively
      http:          false,
      https:         false,
      zlib:          false,
      url:           false,
      querystring:   false,
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
