// This plugin provides a browser-compatible process.env polyfill for Vite

export default function processPolyfill() {
  return {
    name: 'vite-plugin-process-polyfill',
    
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { id: 'process-polyfill' },
          children: `
            window.process = window.process || {};
            window.process.env = window.process.env || {};
            window.process.browser = true;
            window.process.version = '';
          `,
          injectTo: 'head-prepend'
        },
      ];
    },
  };
} 