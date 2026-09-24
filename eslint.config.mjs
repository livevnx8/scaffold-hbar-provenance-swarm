// Flat ESLint config for the provenance-swarm template monorepo.
// Run from the repo root: npm run lint
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/artifacts/**',
      '**/cache/**',
      '**/typechain-types/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Keyed-run Node scripts (not part of the TS build): declare the Node
    // globals they use so no-undef stays meaningful everywhere else.
    files: ['packages/anchors/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
);
