import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// base './' keeps assets relative so the site works at any GitHub Pages path.
export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
