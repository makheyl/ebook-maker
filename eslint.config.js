import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-player',
      'coverage',
      'test-results',
      'playwright-report',
      'node_modules',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "AssignmentExpression[left.property.name='innerHTML']",
          message: 'Never assign innerHTML — build DOM nodes and use textContent.',
        },
      ],
    },
  },
  {
    // core/ and player/ must stay framework-agnostic so the exported player never pulls in React.
    files: ['src/core/**/*.ts', 'src/player/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'core/ and player/ must not depend on React.',
            },
            {
              group: ['@/editor/*', '@/ui/*', '@/dashboard/*', '@/wizard/*', '@/storage/*'],
              message: 'core/ and player/ must not import app code.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
);
