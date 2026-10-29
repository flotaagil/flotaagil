import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Cobertura mínima exigida en los módulos de sesión y API (DoD: ≥ 70 % en lo tocado).
const MINIMO = { lines: 70, functions: 70, branches: 70, statements: 70 };

export default defineConfig({
  plugins: [react()],
  server: {
    // En desarrollo el panel y la API quedan en el mismo origen: la cookie del refresh (Path=/api/auth/)
    // viaja sin CORS. El proxy reenvía Origin tal como lo manda el navegador (http://localhost:5173).
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/pruebas/setup.ts'],
    restoreMocks: true,
    coverage: {
      // Activada siempre: el CI corre `npx vitest run` y los umbrales se exigen igual.
      enabled: true,
      provider: 'v8',
      // Desde Vitest 4 (sin `coverage.all`) `include` es lo que hace contar también los archivos que
      // ninguna prueba carga (con 0 %); sin él, el umbral solo vería los archivos con pruebas.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/api/esquema.d.ts', 'src/pruebas/**', 'src/**/*.test.{ts,tsx}', 'src/main.tsx'],
      thresholds: {
        'src/sesion/**': MINIMO,
        'src/api/**': MINIMO,
      },
    },
  },
});
