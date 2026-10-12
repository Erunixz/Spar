/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sparContent } from './content-plugin'
import { pyodideAssets } from './pyodide-plugin'

export default defineConfig({
  plugins: [react(), tailwindcss(), sparContent(resolve(import.meta.dirname, '../../content')), pyodideAssets()],
  // Pyodide's loader fetches its own runtime files; pre-bundling breaks that.
  optimizeDeps: { exclude: ['pyodide'] },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
