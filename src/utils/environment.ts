/**
 * Utility module to handle environment variables and make them globally accessible
 */

/**
 * Initializes environment variables and ensures they're available on the window object
 */
export function initializeEnvironment(): void {
  // For Vite's import.meta.env
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // Copy all VITE_ prefixed environment variables to window
    Object.keys(import.meta.env).forEach(key => {
      if (key.startsWith('VITE_')) {
        (window as any)[key] = import.meta.env[key];
        
        // Also create non-prefixed version for path variables
        if (key.endsWith('_PATH')) {
          const nonPrefixedKey = key.replace('VITE_', '');
          (window as any)[nonPrefixedKey] = import.meta.env[key];
        }
      }
    });
  }
  
  // Log environment variables related to local development
  console.log('[ENV] LOCAL_CONTRACTS_PATH:', (window as any).LOCAL_CONTRACTS_PATH);
  console.log('[ENV] LOCAL_TOKENS_PATH:', (window as any).LOCAL_TOKENS_PATH);
  console.log('[ENV] VITE_NETWORK_ID:', (window as any).VITE_NETWORK_ID);
  
  // Check file accessibility
  const filesToCheck = [
    '/data/31337-contracts.json',
    '/data/31337-tokens.json'
  ];
  
  filesToCheck.forEach(async (file) => {
    const isAccessible = await checkFileAccessibility(file);
    console.log(`[ENV] File ${file} is ${isAccessible ? 'accessible' : 'NOT accessible'}`);
  });
}

/**
 * Gets an environment variable from various possible sources
 */
export function getEnvVar(name: string): string | undefined {
  // Try window object first
  if (typeof window !== 'undefined' && (window as any)[name]) {
    return (window as any)[name];
  }
  
  // Try import.meta.env (Vite)
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]) {
    return import.meta.env[name];
  }
  
  // Try process.env (Node.js or injected by Vite)
  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return process.env[name];
  }
  
  // Try prefixed version if no prefix
  if (!name.startsWith('VITE_')) {
    return getEnvVar(`VITE_${name}`);
  }
  
  return undefined;
}

/**
 * Checks if a file is accessible via HTTP request
 */
export function checkFileAccessibility(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('HEAD', filePath, true);
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          resolve(xhr.status === 200);
        }
      };
      xhr.send(null);
    } catch (error) {
      console.error(`Error checking file accessibility for ${filePath}:`, error);
      resolve(false);
    }
  });
}

// Export environment variables for easy access
export const ENV = {
  NETWORK_ID: getEnvVar('VITE_NETWORK_ID'),
  LOCAL_CONTRACTS_PATH: getEnvVar('LOCAL_CONTRACTS_PATH'),
  LOCAL_TOKENS_PATH: getEnvVar('LOCAL_TOKENS_PATH'),
  MAINNET_PUBLIC_RPC: getEnvVar('VITE_MAINNET_PUBLIC_RPC'),
  TESTNET_PUBLIC_RPC: getEnvVar('VITE_TESTNET_PUBLIC_RPC'),
}; 