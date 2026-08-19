
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/retail-pro-prototype/',
  plugins: [react()],
  server: { port: 5173 }
})
