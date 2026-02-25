const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add WASM asset extension support
config.resolver.assetExts.push('wasm');

// Add COOP/COEP headers for SharedArrayBuffer support (needed for wa-sqlite on web)
const originalEnhanceMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, metroServer) => {
  if (originalEnhanceMiddleware) {
    middleware = originalEnhanceMiddleware(middleware, metroServer);
  }
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return middleware(req, res, next);
  };
};

module.exports = config;
