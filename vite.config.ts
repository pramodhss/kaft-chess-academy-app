import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // use our own public/manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,jpg,jpeg,png,svg,ico}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/sheets\.googleapis\.com\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sheets-api',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 100, maxAgeSeconds: 3600 },
            },
          },
        ],
      },
    }),
  ],
  base: '/kaft-chess-academy-app/',
})
