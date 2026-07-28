import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // NestJS convention: decorators use classes that look unused to TS
      '@typescript-eslint/no-extraneous-class': 'off',

      // Allow empty constructors for DI
      '@typescript-eslint/no-empty-function': ['error', { allow: ['constructors'] }],

      // Prefer explicit return types on public API surfaces
      '@typescript-eslint/explicit-function-return-type': ['warn', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
      }],

      // Disallow floating promises (critical in async NestJS handlers)
      '@typescript-eslint/no-floating-promises': 'error',

      // Consistent imports
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],

      // No unused vars except those prefixed with _
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // General
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'eqeqeq': ['error', 'always'],
    },
  },
  {
    // Relax rules in test files
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
);
