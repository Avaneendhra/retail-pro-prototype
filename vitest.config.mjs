import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Two kinds of tests:
//   node: plain data logic (store, shared helpers, translations)
//   ui:   React components in a simulated browser
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.js', 'shared/**/*.test.js'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.jsx'],
          setupFiles: ['src/test/setup.js'],
          css: false,
        },
      },
    ],
  },
})
