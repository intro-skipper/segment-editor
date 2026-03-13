import { URL, fileURLToPath } from 'node:url'
import babelPlugin from '@rolldown/plugin-babel'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  lint: {
    plugins: ['oxc', 'typescript', 'unicorn', 'react'],
    categories: {
      correctness: 'warn',
    },
    env: {
      builtin: true,
    },
    ignorePatterns: [
      '**/.nx/**',
      '**/.svelte-kit/**',
      '**/build/**',
      '**/coverage/**',
      '**/dist/**',
      '**/snap/**',
      '**/vite.config.*.timestamp-*.*',
      'eslint.config.js',
      'prettier.config.js',
      'dist-plugin/**',
    ],
    overrides: [
      {
        files: ['**/*.{js,ts,tsx}'],
        rules: {
          'for-direction': 'error',
          'no-async-promise-executor': 'error',
          'no-case-declarations': 'error',
          'no-class-assign': 'error',
          'no-compare-neg-zero': 'error',
          'no-cond-assign': 'error',
          'no-constant-binary-expression': 'error',
          'no-constant-condition': 'error',
          'no-control-regex': 'error',
          'no-debugger': 'error',
          'no-delete-var': 'error',
          'no-dupe-else-if': 'error',
          'no-duplicate-case': 'error',
          'no-empty-character-class': 'error',
          'no-empty-pattern': 'error',
          'no-empty-static-block': 'error',
          'no-ex-assign': 'error',
          'no-extra-boolean-cast': 'error',
          'no-fallthrough': 'error',
          'no-global-assign': 'error',
          'no-invalid-regexp': 'error',
          'no-irregular-whitespace': 'error',
          'no-loss-of-precision': 'error',
          'no-misleading-character-class': 'error',
          'no-nonoctal-decimal-escape': 'error',
          'no-regex-spaces': 'error',
          'no-self-assign': 'error',
          'no-shadow': 'warn',
          'no-shadow-restricted-names': 'error',
          'no-sparse-arrays': 'error',
          'no-unsafe-finally': 'error',
          'no-unsafe-optional-chaining': 'error',
          'no-unused-labels': 'error',
          'no-unused-private-class-members': 'error',
          'no-useless-backreference': 'error',
          'no-useless-catch': 'error',
          'no-useless-escape': 'error',
          'no-var': 'error',
          'no-with': 'error',
          'prefer-const': 'error',
          'require-yield': 'error',
          'sort-imports': [
            'error',
            {
              ignoreDeclarationSort: true,
            },
          ],
          'use-isnan': 'error',
          'valid-typeof': 'error',
          '@typescript-eslint/array-type': [
            'error',
            {
              default: 'generic',
              readonly: 'generic',
            },
          ],
          '@typescript-eslint/ban-ts-comment': [
            'error',
            {
              'ts-expect-error': false,
              'ts-ignore': 'allow-with-description',
            },
          ],
          '@typescript-eslint/consistent-type-imports': [
            'error',
            {
              prefer: 'type-imports',
            },
          ],
          '@typescript-eslint/no-duplicate-enum-values': 'error',
          '@typescript-eslint/no-extra-non-null-assertion': 'error',
          '@typescript-eslint/no-for-in-array': 'error',
          '@typescript-eslint/no-inferrable-types': [
            'error',
            {
              ignoreParameters: true,
            },
          ],
          '@typescript-eslint/no-misused-new': 'error',
          '@typescript-eslint/no-namespace': 'error',
          '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
          '@typescript-eslint/no-unnecessary-condition': 'error',
          '@typescript-eslint/no-unnecessary-type-assertion': 'error',
          '@typescript-eslint/no-unsafe-function-type': 'error',
          '@typescript-eslint/no-wrapper-object-types': 'error',
          '@typescript-eslint/prefer-as-const': 'error',
          '@typescript-eslint/prefer-for-of': 'warn',
          '@typescript-eslint/require-await': 'warn',
          '@typescript-eslint/triple-slash-reference': 'error',
          'import/consistent-type-specifier-style': [
            'error',
            'prefer-top-level',
          ],
          'import/first': 'error',
          'import/no-commonjs': 'error',
          'import/no-duplicates': 'error',
          '@stylistic/spaced-comment': 'error',
        },
        jsPlugins: ['@stylistic/eslint-plugin'],
        env: {
          es2020: true,
          browser: true,
        },
        plugins: ['import'],
      },
      {
        files: ['**/*.vue'],
        rules: {
          'for-direction': 'error',
          'no-async-promise-executor': 'error',
          'no-case-declarations': 'error',
          'no-class-assign': 'error',
          'no-compare-neg-zero': 'error',
          'no-cond-assign': 'error',
          'no-constant-binary-expression': 'error',
          'no-constant-condition': 'error',
          'no-control-regex': 'error',
          'no-debugger': 'error',
          'no-delete-var': 'error',
          'no-dupe-else-if': 'error',
          'no-duplicate-case': 'error',
          'no-empty-character-class': 'error',
          'no-empty-pattern': 'error',
          'no-empty-static-block': 'error',
          'no-ex-assign': 'error',
          'no-extra-boolean-cast': 'error',
          'no-fallthrough': 'error',
          'no-global-assign': 'error',
          'no-invalid-regexp': 'error',
          'no-irregular-whitespace': 'error',
          'no-loss-of-precision': 'error',
          'no-misleading-character-class': 'error',
          'no-nonoctal-decimal-escape': 'error',
          'no-regex-spaces': 'error',
          'no-self-assign': 'error',
          'no-shadow': 'warn',
          'no-shadow-restricted-names': 'error',
          'no-sparse-arrays': 'error',
          'no-unsafe-finally': 'error',
          'no-unsafe-optional-chaining': 'error',
          'no-unused-labels': 'error',
          'no-unused-private-class-members': 'error',
          'no-useless-backreference': 'error',
          'no-useless-catch': 'error',
          'no-useless-escape': 'error',
          'no-var': 'error',
          'no-with': 'error',
          'prefer-const': 'error',
          'require-yield': 'error',
          'sort-imports': [
            'error',
            {
              ignoreDeclarationSort: true,
            },
          ],
          'use-isnan': 'error',
          'valid-typeof': 'error',
          '@typescript-eslint/array-type': [
            'error',
            {
              default: 'generic',
              readonly: 'generic',
            },
          ],
          '@typescript-eslint/ban-ts-comment': [
            'error',
            {
              'ts-expect-error': false,
              'ts-ignore': 'allow-with-description',
            },
          ],
          '@typescript-eslint/consistent-type-imports': [
            'error',
            {
              prefer: 'type-imports',
            },
          ],
          '@typescript-eslint/no-duplicate-enum-values': 'error',
          '@typescript-eslint/no-extra-non-null-assertion': 'error',
          '@typescript-eslint/no-for-in-array': 'error',
          '@typescript-eslint/no-inferrable-types': [
            'error',
            {
              ignoreParameters: true,
            },
          ],
          '@typescript-eslint/no-misused-new': 'error',
          '@typescript-eslint/no-namespace': 'error',
          '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
          '@typescript-eslint/no-unnecessary-condition': 'error',
          '@typescript-eslint/no-unnecessary-type-assertion': 'error',
          '@typescript-eslint/no-unsafe-function-type': 'error',
          '@typescript-eslint/no-wrapper-object-types': 'error',
          '@typescript-eslint/prefer-as-const': 'error',
          '@typescript-eslint/prefer-for-of': 'warn',
          '@typescript-eslint/require-await': 'warn',
          '@typescript-eslint/triple-slash-reference': 'error',
          'import/consistent-type-specifier-style': [
            'error',
            'prefer-top-level',
          ],
          'import/first': 'error',
          'import/no-commonjs': 'error',
          'import/no-duplicates': 'error',
          '@stylistic/spaced-comment': 'error',
        },
        jsPlugins: ['@stylistic/eslint-plugin'],
        plugins: ['import'],
        env: {
          browser: true,
        },
      },
      {
        files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
        rules: {
          'react-you-might-not-need-an-effect/no-empty-effect': 'warn',
          'react-you-might-not-need-an-effect/no-adjust-state-on-prop-change':
            'warn',
          'react-you-might-not-need-an-effect/no-reset-all-state-on-prop-change':
            'warn',
          'react-you-might-not-need-an-effect/no-event-handler': 'warn',
          'react-you-might-not-need-an-effect/no-pass-live-state-to-parent':
            'warn',
          'react-you-might-not-need-an-effect/no-pass-data-to-parent': 'warn',
          'react-you-might-not-need-an-effect/no-initialize-state': 'warn',
          'react-you-might-not-need-an-effect/no-chain-state-updates': 'warn',
          'react-you-might-not-need-an-effect/no-derived-state': 'warn',
        },
        jsPlugins: ['eslint-plugin-react-you-might-not-need-an-effect'],
        globals: {
          AudioWorkletGlobalScope: 'readonly',
          AudioWorkletProcessor: 'readonly',
          currentFrame: 'readonly',
          currentTime: 'readonly',
          registerProcessor: 'readonly',
          sampleRate: 'readonly',
          WorkletGlobalScope: 'readonly',
        },
        env: {
          browser: true,
        },
      },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    semi: false,
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 80,
    sortPackageJson: false,
    ignorePatterns: ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'],
  },
  plugins: [
    ...(devtools({ removeDevtoolsOnBuild: false }) as Array<any>),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    viteReact(),
    babelPlugin({
      presets: [reactCompilerPreset()],
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
        codeSplitting: {
          groups: [
            // Core React ecosystem
            {
              name: 'react-vendor',
              test: /node_modules\/(react|react-dom|zod)\//,
            },
            // TanStack libraries
            {
              name: 'tanstack-vendor',
              test: /node_modules\/@tanstack\/(react-form|react-hotkeys|react-query|react-router)\//,
            },
            // UI libraries
            {
              name: 'ui-vendor',
              test: /node_modules\/(@base-ui\/react|lucide-react|sonner|class-variance-authority|clsx|tailwind-merge|motion)\//,
            },
            // Media libraries
            {
              name: 'media-vendor',
              test: /node_modules\/(node-vibrant|culori|blurhash)\//,
            },
            {
              name: 'hls-vendor',
              test: /node_modules\/hls\.js\//,
            },
            {
              name: 'subtitle-vendor',
              test: /node_modules\/jassub\//,
            },
            // Jellyfin SDK
            {
              name: 'jellyfin-vendor',
              test: /node_modules\/(@jellyfin\/sdk|axios)\//,
            },
            // i18n
            {
              name: 'i18n-vendor',
              test: /node_modules\/(i18next|react-i18next)\//,
            },
          ],
        },
      },
    },
  },
})
