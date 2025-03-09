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

export default defineConfig(() => ({
    resolve: {
        dedupe: ['buffer', 'bn.js', 'keccak', 'ethers'],
    },
    plugins: [react(), vercel(), tsConfigPaths()],
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
        // Explicitly define environment variables for the client
        'process.env.LOCAL_CONTRACTS_PATH': JSON.stringify(envVars.VITE_LOCAL_CONTRACTS_PATH || ''),
        'process.env.LOCAL_TOKENS_PATH': JSON.stringify(envVars.VITE_LOCAL_TOKENS_PATH || ''),
        'process.env.VITE_LOCAL_CONTRACTS_PATH': JSON.stringify(envVars.VITE_LOCAL_CONTRACTS_PATH || ''),
        'process.env.VITE_LOCAL_TOKENS_PATH': JSON.stringify(envVars.VITE_LOCAL_TOKENS_PATH || ''),
        
        // Also expose to window for direct access
        'window.LOCAL_CONTRACTS_PATH': JSON.stringify(envVars.VITE_LOCAL_CONTRACTS_PATH || ''),
        'window.LOCAL_TOKENS_PATH': JSON.stringify(envVars.VITE_LOCAL_TOKENS_PATH || ''),
        'window.VITE_LOCAL_CONTRACTS_PATH': JSON.stringify(envVars.VITE_LOCAL_CONTRACTS_PATH || ''),
        'window.VITE_LOCAL_TOKENS_PATH': JSON.stringify(envVars.VITE_LOCAL_TOKENS_PATH || '')
    }
}))
