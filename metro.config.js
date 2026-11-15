const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Zustand 5's ESM build reads `import.meta.env`. Metro serves the web bundle as a classic
// script, so that syntax throws "Cannot use 'import.meta' outside a module" and the app
// never mounts. The package's CJS build is the same code without `import.meta`, and it's
// what the react-native export condition already selects on device. Use it on web too.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && (moduleName === 'zustand' || moduleName.startsWith('zustand/'))) {
    const subpath = moduleName === 'zustand' ? 'index.js' : `${moduleName.slice('zustand/'.length)}.js`;
    return {
      type: 'sourceFile',
      filePath: path.join(__dirname, 'node_modules/zustand', subpath),
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
