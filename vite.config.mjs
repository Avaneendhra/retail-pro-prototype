import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Two builds from the same code:
//   npm run build      for GitHub Pages, under /retail-pro-prototype/ (or BASE_PATH)
//   npm run build:app  for the stokd server, at the site root, written to server/public
export default defineConfig(({ mode }) => {
  const forServer = mode === 'app'
  const base = forServer ? '/' : (process.env.BASE_PATH || '/retail-pro-prototype/')
  return {
  base,
  build: forServer ? { outDir: 'server/public', emptyOutDir: true } : {},
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      workbox: {
        // include the barcode engine (.wasm) so scanning works offline too
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api\//]
      },
      manifest: {
        id: base,
        name: 'stokd — billing & stock',
        short_name: 'stokd',
        description: 'Billing and inventory for small shops',
        lang: 'en',
        start_url: `${base}#/home`,
        scope: base,
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
          { name: 'New sale', short_name: 'Sale', url: `${base}#/home`, icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Add product', short_name: 'Add', url: `${base}#/add-stock`, icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Inventory', short_name: 'Stock', url: `${base}#/inventory`, icons: [{ src: 'icon-192.png', sizes: '192x192' }] }
        ]
      }
    })
  ],
  // While developing, /api goes to the local stokd server (npm run dev:api).
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } }
  }
})
