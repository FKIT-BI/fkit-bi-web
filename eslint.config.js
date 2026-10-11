import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const layers = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];
const boundaries = layers.slice(1).map((layer, i) => ({
  files: [`src/${layer}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: layers.slice(0, i + 1).map((l) => `@/${l}/*`).concat(layers.slice(0, i + 1).map((l) => `@/${l}`)),
            message: `Слой ${layer} не может импортировать вышележащие слои (${layers.slice(0, i + 1).join(', ')}).`,
          },
        ],
      },
    ],
  },
}));

export default tseslint.config(
  { ignores: ['dist', 'public/mockServiceWorker.js'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  ...boundaries,
  {
    files: ['src/{app,pages,widgets,features,entities}/**/*.{ts,tsx}'],
    rules: { 'no-restricted-globals': ['error', { name: 'fetch', message: 'Используйте shared/api.' }] },
  },
);
