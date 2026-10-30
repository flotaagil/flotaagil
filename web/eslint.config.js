import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'src/api/esquema.d.ts']),
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    extends: [tseslint.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    // Scripts de Node (verificaciones del build).
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // Las pruebas y los proveedores exportan utilidades además de componentes.
    files: [
      'src/pruebas/**',
      'src/**/*.test.{ts,tsx}',
      'src/sesion/SesionProvider.tsx',
      'src/rutas/tabla.tsx',
      'src/componentes/ErrorDeRuta.tsx',
    ],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Las fechas por partes usan la zona del navegador: fuera de src/hora/ se usa src/hora/ (America/Santiago).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/hora/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...[
          'getFullYear',
          'getMonth',
          'getDate',
          'getDay',
          'getHours',
          'getMinutes',
          'getSeconds',
          'getTimezoneOffset',
          'setFullYear',
          'setMonth',
          'setDate',
          'setHours',
          'setMinutes',
          'setSeconds',
          'toLocaleString',
          'toLocaleDateString',
          'toLocaleTimeString',
          'toDateString',
          'toTimeString',
        ].map((property) => ({
          property,
          message: 'Usa src/hora/ (America/Santiago): esto depende de la zona horaria del navegador.',
        })),
      ],
    },
  },
]);
