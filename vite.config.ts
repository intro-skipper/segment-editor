import { URL, fileURLToPath } from 'node:url'
import babel from '@rolldown/plugin-babel'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export const pwaPlugin = VitePWA({
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
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    devtools({ removeDevtoolsOnBuild: false }),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    viteReact(),
    babel({
      presets: [reactCompilerPreset()],
    }),
    pwaPlugin,
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
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /[\\/]node_modules[\\/](react|react-dom|zod)[\\/]/,
            },
            {
              name: 'tanstack-vendor',
              test: /[\\/]node_modules[\\/]@tanstack[\\/](react-form|react-hotkeys|react-query|react-router)[\\/]/,
            },
            {
              name: 'ui-vendor',
              test: /[\\/]node_modules[\\/](@base-ui[\\/]react|lucide-react|sonner|class-variance-authority|clsx|tailwind-merge|motion)[\\/]/,
            },
            {
              name: 'media-vendor',
              test: /[\\/]node_modules[\\/](node-vibrant|culori|blurhash)[\\/]/,
            },
            {
              name: 'hls-vendor',
              test: /[\\/]node_modules[\\/]hls\.js[\\/]/,
            },
            {
              name: 'subtitle-vendor',
              test: /[\\/]node_modules[\\/]jassub[\\/]/,
            },
            {
              name: 'jellyfin-vendor',
              test: /[\\/]node_modules[\\/](@jellyfin[\\/]sdk|axios)[\\/]/,
            },
            {
              name: 'i18n-vendor',
              test: /[\\/]node_modules[\\/](i18next|react-i18next)[\\/]/,
            },
          ],
        },
      },
    },
  },
})
