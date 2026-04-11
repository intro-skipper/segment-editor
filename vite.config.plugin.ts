import { defineConfig, mergeConfig } from 'vite'
import type { UserConfig } from 'vite'
import baseConfig, { pwaPlugin } from './vite.config'

const withoutPwa: UserConfig = {
  ...baseConfig,
  plugins: (baseConfig.plugins ?? []).filter((p) => p !== pwaPlugin),
}

export default defineConfig(
  mergeConfig(withoutPwa, {
    base: '/SegmentEditor/',
    build: {
      outDir: 'dist-plugin',
      rolldownOptions: {
        external: ['virtual:pwa-register'],
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  }),
)
