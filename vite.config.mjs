import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/retail-pro-prototype/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      devOptions: {
        enabled: true
      },
      workbox: {
        // include the barcode engine (.wasm) so scanning works offline too
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true
      },
      manifest: {
        id: '/retail-pro-prototype/',
        name: 'stokd — billing & stock',
        short_name: 'stokd',
        description: 'Billing and inventory for small shops',
        lang: 'en',
        start_url: '/retail-pro-prototype/#/home',
        scope: '/retail-pro-prototype/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        theme_color: '#0D0D0D',
        background_color: '#0D0D0D',
        categories: ['business', 'productivity', 'shopping'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          { name: 'New sale', short_name: 'Sale', url: '/retail-pro-prototype/#/home', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Add product', short_name: 'Add', url: '/retail-pro-prototype/#/add-stock', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Inventory', short_name: 'Stock', url: '/retail-pro-prototype/#/inventory', icons: [{ src: 'icon-192.png', sizes: '192x192' }] }
        ]
      }
    })
  ],
  server: { port: 5173 }
})
