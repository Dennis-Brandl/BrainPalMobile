const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo support: watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// Monorepo support: resolve packages from both project and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

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
