// =============================================================================
// PlumbTix — ESLint 9 Flat Config
// =============================================================================
// Lints src/ and shared/ (browser TypeScript/React code).
// Edge functions (supabase/functions/) are excluded — they're Deno code with
// URL imports that Node-side ESLint can't resolve.
// =============================================================================

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'supabase/functions/**',
      'public/**',
      'e2e/**',
      'playwright.config.ts',
      'vite.config.ts',
      'vitest.config.ts',
      'tailwind.config.js',
      'tailwind.config.ts',
      'postcss.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'shared/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      // React hooks correctness (rules of hooks + dependency checking)
      ...reactHooks.configs.recommended.rules,

      // --- New React-Compiler-era rules: OFF for now. ---
      // They flag the standard "load data in useEffect on mount" pattern
      // this entire app is built on. Adopting them means an architectural
      // refactor (e.g. React Query), not a lint fix. Revisit deliberately.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/incompatible-library': 'off',

      // Dependency-array checking stays on as a warning (real bug-finder)
      'react-hooks/exhaustive-deps': 'warn',

      // Pragmatic starting point — tighten later once baseline is clean
      '@typescript-eslint/no-explicit-any': 'off',
      // shadcn/ui components use empty interfaces extending HTML props — fine
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);