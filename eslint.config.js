import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-extra-boolean-cast': 'warn',
      'no-useless-escape': 'warn',
      'prefer-const': 'warn',
      'react-refresh/only-export-components': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    }
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['react', 'react/*', 'react-dom', 'react-dom/*'],
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'react',
            'react/*',
            'react-dom',
            'react-dom/*',
            'd3',
            'd3/*',
            'vega',
            'vega/*',
            'vega-lite',
            'vega-lite/*',
            'vega-embed',
            'vega-embed/*',
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document'],
    },
  },
  {
    files: [
      'src/operation/run/runChartOps.ts',
      'src/operation/run/multipleLineOps.ts',
      'src/operation/build/builder-core/optionSources.ts',
      'src/rendering/common/d3Helpers.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'src/!(api)/**',
            './src/!(api)/**',
            '../src/!(api)/**',
            '../../src/!(api)/**',
            '../../../src/!(api)/**',
            '../../../../src/!(api)/**',
          ],
        },
      ],
    },
  },
])
