import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules\/(jspdf|jspdf-autotable|html2canvas|dompurify)\//.test(id)) return 'pdf-vendor'
        },
      },
    },
  },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // use our own public/manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,jpg,jpeg,png,svg,ico}'],
        globIgnores: ['**/pdf-vendor-*.js'],
      },
    }),
  ],
  base: '/kaft-chess-academy-app/',
})
