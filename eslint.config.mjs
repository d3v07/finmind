import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.dexter/**',
      '.git/**',
      'coverage/**',
      'bun.lock',
      'eslint.config.mjs',
      'apps/api/drizzle.config.ts'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    }
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error'
    }
  }
];
