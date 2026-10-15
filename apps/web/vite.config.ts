/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sparContent } from './content-plugin'
import { modelAssets } from './model-assets-plugin'
import { pyodideAssets } from './pyodide-plugin'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    sparContent(resolve(import.meta.dirname, '../../content')),
    pyodideAssets(),
    modelAssets(resolve(import.meta.dirname, '../../ml/artifacts')),
  ],
  // Pyodide and Transformers.js fetch their own runtime files; pre-bundling breaks that.
  optimizeDeps: { exclude: ['pyodide', '@huggingface/transformers'] },
  worker: { format: 'es' },
  // The visualizer chunk (CodeMirror + views) is ~520 KB but lazy-loaded with its tab;
  // the main bundle stays well under this, so the warning still catches real growth there.
  build: { chunkSizeWarningLimit: 600 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
