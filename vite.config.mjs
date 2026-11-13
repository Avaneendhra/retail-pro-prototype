
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
      devOptions: {
        enabled: true
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        skipWaiting: true,
        clientsClaim: true
      },
      manifest: {
        name: 'Smart Retail Pro',
        short_name: 'RetailPro',
        description: 'Smart Billing & Inventory Management System',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'https://via.placeholder.com/192x192.png?text=Retail+Pro',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'https://via.placeholder.com/512x512.png?text=Retail+Pro',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: { port: 5173 }
})
