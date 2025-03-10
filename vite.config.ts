import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import vercel from 'vite-plugin-vercel'
import tsConfigPaths from 'vite-tsconfig-paths'
import path from 'path'
import fs from 'fs'
// https://vitejs.dev/config/

// Load environment variables from .env files
const envPath = path.resolve(__dirname, '.env')
const localEnvPath = path.resolve(__dirname, '.env.local')

// Parse .env files if they exist
const parseEnvFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) return {}

  const envContent = fs.readFileSync(filePath, 'utf-8')
  const envVars: Record<string, string> = {}

  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
    if (!match) return
    
    const key = match[1]
    const value = match[2] || ''
    envVars[key] = value.replace(/^['"]|['"]$/g, '') // Remove quotes
  })

  return envVars
}

const envVars = {
  ...parseEnvFile(envPath),
  ...parseEnvFile(localEnvPath)
}

// Generate both prefixed and non-prefixed versions of environment variables
const generateEnvDefinitions = () => {
  const definitions: Record<string, string> = {}
  
  // Process all environment variables
  Object.keys(envVars).forEach(key => {
    const value = JSON.stringify(envVars[key])
    
    // For VITE_ prefixed variables
    if (key.startsWith('VITE_')) {
      // Define under import.meta.env
      definitions[`import.meta.env.${key}`] = value
      
      // Also define under process.env 
      definitions[`process.env.${key}`] = value
      
      // And add to window for global access
      definitions[`window.${key}`] = value
      
      // If it's a path variable, also create a non-prefixed version
      if (key.endsWith('_PATH')) {
        const nonPrefixedKey = key.replace('VITE_', '')
        definitions[`process.env.${nonPrefixedKey}`] = value
        definitions[`window.${nonPrefixedKey}`] = value
      }
    }
  })
  
  return definitions
}

export default defineConfig(() => ({
    resolve: {
        dedupe: ['buffer', 'bn.js', 'keccak', 'ethers']
    },
    plugins: [
        react(), 
        vercel(), 
        tsConfigPaths()
    ],
    vercel: {
        expiration: 25,
        additionalEndpoints: [
            {
                source: './src/api/hai/total-supply.ts',
                destination: `/api/hai/total-supply`,
                addRoute: true,
            },
            {
                source: './src/api/hai/circulating-supply.ts',
                destination: `/api/hai/circulating-supply`,
                addRoute: true,
            },
            {
                source: './src/api/kite/total-supply.ts',
                destination: `/api/kite/total-supply`,
                addRoute: true,
            },
            {
                source: './src/api/kite/circulating-supply.ts',
                destination: `/api/kite/circulating-supply`,
                addRoute: true,
            },
        ],
    },
    optimizeDeps: {
        esbuildOptions: {
            // Node.js global to browser globalThis
            define: {
                global: 'globalThis',
            },
        },
    },
    build: {
        outDir: 'build',
        target: 'es2015',
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/setupTests.ts',
        // css: true,
    },
    define: {
        // Dynamically generate all environment variable definitions
        ...generateEnvDefinitions(),
        
        // Also define the environment mode
        'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV || 'development'),
        'import.meta.env.DEV': process.env.NODE_ENV !== 'production',
        'import.meta.env.PROD': process.env.NODE_ENV === 'production'
    }
}))
