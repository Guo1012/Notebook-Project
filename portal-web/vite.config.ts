import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },

      '/runtime-api': {
        target: 'http://127.0.0.1:8100',
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/runtime-api/, ''),
      },

      '/runtime-proxy': {
        target: 'http://127.0.0.1:8200',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})