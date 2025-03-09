import path from 'path';
import fs from 'fs';

// Custom plugin to resolve the SDK imports
export default function sdkResolver() {
  // Use browser.js instead of index.js for better browser compatibility
  const sdkPath = path.resolve(__dirname, '../parys-sdk/lib/browser.js');
  
  return {
    name: 'sdk-resolver',
    resolveId(source) {
      if (source === '@parisii-inc/parys-sdk') {
        return sdkPath;
      }
      
      if (source.startsWith('@parisii-inc/parys-sdk/')) {
        const filePath = path.resolve(
          __dirname, 
          '../parys-sdk/lib', 
          source.replace('@parisii-inc/parys-sdk/', '')
        );
        
        if (fs.existsSync(filePath)) {
          return filePath;
        }
      }
      
      return null;
    }
  };
} 