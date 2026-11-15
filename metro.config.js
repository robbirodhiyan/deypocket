const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// SQLite WebAssembly
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// COOP dan COEP untuk SharedArrayBuffer
const originalMiddleware = config.server.enhanceMiddleware;

config.server.enhanceMiddleware = (middleware, metroServer) => {
  const enhancedMiddleware = originalMiddleware
    ? originalMiddleware(middleware, metroServer)
    : middleware;

  return (req, res, next) => {
    res.setHeader(
      'Cross-Origin-Opener-Policy',
      'same-origin'
    );

    res.setHeader(
      'Cross-Origin-Embedder-Policy',
      'credentialless'
    );

    return enhancedMiddleware(req, res, next);
  };
};

module.exports = config;
