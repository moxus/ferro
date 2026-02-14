import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/ferro/',
  resolve: {
    alias: {
      '@ferro': path.resolve(__dirname, '../ferro/src')
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
