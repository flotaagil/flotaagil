import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'src/api/esquema.d.ts']),
  {
    files: ['**/*.{ts,tsx,js}'],
    extends: [tseslint.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    // Las pruebas y los proveedores exportan utilidades además de componentes.
    files: ['src/pruebas/**', 'src/**/*.test.{ts,tsx}', 'src/sesion/SesionProvider.tsx', 'src/rutas/tabla.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
]);
