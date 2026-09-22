import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        // backend routes have NO /api prefix -> strip it here
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})