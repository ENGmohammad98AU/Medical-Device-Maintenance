import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import {existsSync} from 'node:fs'
import prefixBundle from './src/llm/staticPrefixBundle.json'

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_STATIC_PREFIX_ASSETS': JSON.stringify(existsSync(path.resolve(import.meta.dirname,
      'public/llm', prefixBundle.id, 'prefix-manifest.json'))),
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
