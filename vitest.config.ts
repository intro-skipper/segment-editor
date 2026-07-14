import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./src/vitest.setup.ts'],
    server: {
      deps: {
        // @material/material-color-utilities 0.4.0 ships an extensionless ESM
        // import (dynamiccolor/color_spec_2025.js -> './dynamic_color') that
        // Node's native resolver rejects; inline it so Vite resolves it.
        inline: ['@material/material-color-utilities'],
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
