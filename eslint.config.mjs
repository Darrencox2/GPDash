import reactHooks from 'eslint-plugin-react-hooks';
export default [
  // Build output and vendor code are not ours to lint. Without this,
  // `npx eslint .` returned ~98 errors from .next/ chunks and buried the
  // handful of real warnings in project source - which is why nobody read
  // the output and the real ones never got triaged.
  {
    ignores: ['.next/**', 'node_modules/**', 'test-results/**', 'playwright-report/**', 'public/sw.js'],
  },
  {
    files: ['app/**/*.js', 'components/**/*.js', 'lib/**/*.js'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2024, sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-constant-binary-expression': 'error',
      'no-self-assign': 'error',
      'no-async-promise-executor': 'error',
      'no-compare-neg-zero': 'error',
      'valid-typeof': 'error',
      'use-isnan': 'error',
    },
  },
];
