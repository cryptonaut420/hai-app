import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';
import sdkResolver from './vite-sdk-resolver';
import processPolyfill from './vite-process-polyfill';

export default defineConfig({
  plugins: [
    processPolyfill(),
    react(),
    tsconfigPaths(),
    sdkResolver(),
    // Add a custom plugin to exclude node-specific packages
    {
      name: 'vite-plugin-exclude-node-modules',
      resolveId(source) {
        // Return a dummy module for node-specific packages
        if (source === 'dotenv' || 
            source === 'dotenv/config' || 
            source === 'fs' || 
            source === 'path' ||
            /dotenv/.test(source)) {
          return 'virtual:empty-module';
        }
        return null;
      },
      load(id) {
        if (id === 'virtual:empty-module') {
          return 'export default {}; export const config = {};';
        }
        return null;
      }
    }
  ],
  resolve: {
    alias: {
      // Add aliases for node modules to replace them with empty modules
      'dotenv': path.resolve(__dirname, './node-polyfills/empty.js'),
      'dotenv/config': path.resolve(__dirname, './node-polyfills/empty.js'),
      'fs': path.resolve(__dirname, './node-polyfills/empty.js'),
      'path': path.resolve(__dirname, './node-polyfills/empty.js')
    }
  },
  optimizeDeps: {
    include: ['@parisii-inc/parys-sdk'],
    esbuildOptions: {
      // Define Node.js globals
      define: {
        global: 'globalThis'
      }
    }
  },
  define: {
    // Provide polyfills for Node.js globals
    'process.env': JSON.stringify({}),
    'process.browser': true,
    'process.version': JSON.stringify(''),
    'global': 'window'
  },
  build: {
    commonjsOptions: {
      // Explicitly ignore Node.js built-ins
      ignore: ['fs', 'path', 'dotenv', 'os', 'crypto']
    }
  }
}); 