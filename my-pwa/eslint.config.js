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
      globals: globals.browser,
    },
    rules: {
      // A date formatted without a time zone shows the device's day and
      // hour, not the Philippine ones the server means. Use formatPh or
      // the helpers in lib/format.ts, or state timeZone in the call.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name=/^toLocale(Date|Time)String$/]:not(:has(Property[key.name='timeZone']))",
          message:
            'Give toLocaleDateString/toLocaleTimeString a timeZone, or use formatPh from lib/phTime.ts.',
        },
        {
          selector:
            "CallExpression[callee.property.name='toLocaleString'][callee.object.type='NewExpression'][callee.object.callee.name='Date']:not(:has(Property[key.name='timeZone']))",
          message: 'Give new Date().toLocaleString() a timeZone, or use phStamp from lib/phTime.ts.',
        },
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']:not(:has(Property[key.name='timeZone']))",
          message: 'Give Intl.DateTimeFormat a timeZone (PH_TIME_ZONE from lib/phTime.ts).',
        },
      ],
    },
  },
  {
    // The brand kit's feedback file exports its hooks beside its components,
    // and its sign-in screen exports its role wording beside the component.
    files: ['src/brand/feedback.tsx', 'src/brand/LoginScreen.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
