import { defineConfig, mergeConfig } from 'vite'
import baseConfig from './vite.config'

export default defineConfig(
  mergeConfig(baseConfig, {
    base: '/SegmentEditor/',
    build: {
      outDir: 'dist-plugin',
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  }),
)
