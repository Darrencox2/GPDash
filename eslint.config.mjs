import reactHooks from 'eslint-plugin-react-hooks';
export default [
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
