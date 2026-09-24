import { defineConfig, mergeConfig } from 'vite'
import type { UserConfig } from 'vite'
import baseConfig, { pwaPlugin } from './vite.config'

const withoutPwa: UserConfig = {
  ...baseConfig,
  plugins: (baseConfig.plugins ?? []).filter((p) => p !== pwaPlugin),
}

export default defineConfig(
  mergeConfig(withoutPwa, {
    // A relative base makes JS and CSS resolve assets against their own URL,
    // so the bundle works under any Jellyfin base URL (e.g. `/jellyfin`).
    base: './',
    experimental: {
      // HTML tags resolve against the page, which is either jellyfin-web at
      // `{base}/web/` (config page) or `{base}/SegmentEditor/` (direct URL).
      // Both share the parent directory, so point every tag through it.
      renderBuiltUrl: (filename, { hostType }) =>
        hostType === 'html' ? `../SegmentEditor/${filename}` : undefined,
    },
    build: {
      outDir: 'dist-plugin',
      rolldownOptions: {
        external: ['virtual:pwa-register'],
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  } satisfies UserConfig),
)
