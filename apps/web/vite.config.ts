/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sparContent } from './content-plugin'

export default defineConfig({
  plugins: [react(), tailwindcss(), sparContent(resolve(import.meta.dirname, '../../content'))],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
