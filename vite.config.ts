import { URL, fileURLToPath } from 'node:url'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
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
    VitePWA({
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Segment Editor',
        short_name: 'Segment Editor',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#000000',
        icons: [
          {
            src: '/logo192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/logo512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/logo512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: false,
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
  worker: {
    format: 'es',
  },
  build: {
    // Keep warning useful, but avoid noise for intentionally large media/vendor chunks
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React ecosystem
          'react-vendor': ['react', 'react-dom', 'zod'],
          // TanStack libraries
          'tanstack-vendor': [
            '@tanstack/react-query',
            '@tanstack/react-router',
          ],
          // UI libraries
          'ui-vendor': [
            '@base-ui/react',
            'lucide-react',
            'sonner',
            'class-variance-authority',
            'clsx',
            'tailwind-merge',
            'motion',
          ],
          // Media libraries
          'media-vendor': ['node-vibrant', 'culori', 'blurhash'],
          'hls-vendor': ['hls.js'],
          'subtitle-vendor': ['jassub'],
          // Jellyfin SDK
          'jellyfin-vendor': ['@jellyfin/sdk', 'axios'],
          // i18n
          'i18n-vendor': ['i18next', 'react-i18next'],
        },
      },
    },
  },
})
