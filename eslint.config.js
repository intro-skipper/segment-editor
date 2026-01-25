//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import reactYouMightNotNeedAnEffect from 'eslint-plugin-react-you-might-not-need-an-effect'

export default [
  ...tanstackConfig,
  reactYouMightNotNeedAnEffect.configs.recommended,
  {
    ignores: ['eslint.config.js', 'prettier.config.js'],
  },
]
