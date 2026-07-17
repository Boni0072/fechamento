import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const certDir = path.resolve(process.cwd(), '.cert')
const certFile = path.join(certDir, 'cert.pem')
const keyFile = path.join(certDir, 'key.pem')

let https = null
if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
  https = {
    key: fs.readFileSync(keyFile),
    cert: fs.readFileSync(certFile)
  }
}

export default defineConfig({
  plugins: [react()],
  base: '/',                    // ← ADICIONADO
  server: {
    port: 3000,
    open: true,
    https: https,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/database', 'firebase/storage']
        }
      }
    }
  }
})