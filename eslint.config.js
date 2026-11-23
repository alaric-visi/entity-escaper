import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
  },
  {
    files: ['tests/**/*.js', 'e2e/**/*.js', 'scripts/**/*.mjs', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
