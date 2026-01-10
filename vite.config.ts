import { URL, fileURLToPath } from 'node:url'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/SegmentEditor/',
  plugins: [
    devtools(),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    viteReact({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // JASSUB benefits from SharedArrayBuffer for multi-threading
    // Using 'credentialless' instead of 'require-corp' to allow cross-origin fetches
    // while still enabling SharedArrayBuffer support
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  preview: {
    // Same headers for preview server
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  optimizeDeps: {
    exclude: ['jassub'],
    include: ['jassub > throughput'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React ecosystem
          'react-vendor': ['react', 'react-dom', 'zod'],
          // TanStack libraries
          'tanstack-vendor': [
            '@tanstack/react-query',
            '@tanstack/react-router',
            '@tanstack/react-virtual',
          ],
          // UI libraries
          'ui-vendor': [
            '@base-ui/react',
            'lucide-react',
            'sonner',
            'class-variance-authority',
            'clsx',
            'tailwind-merge',
          ],
          // Media libraries
          'media-vendor': ['node-vibrant', 'culori', 'blurhash'],
          'hls-vendor': ['hls.js'],
          // Jellyfin SDK
          'jellyfin-vendor': ['@jellyfin/sdk', 'axios'],
          // i18n
          'i18n-vendor': ['i18next', 'react-i18next'],
        },
      },
    },
  },
})
