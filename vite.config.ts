import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/vega') || id.includes('/vega-lite') || id.includes('/vega-embed')) {
            return 'vendor-vega'
          }
          if (id.includes('/d3')) {
            return 'vendor-d3'
          }
          if (id.includes('/firebase')) {
            return 'vendor-firebase'
          }
          if (id.includes('/react')) {
            return 'vendor-react'
          }
          return 'vendor-misc'
        },
      },
    },
  },
})
