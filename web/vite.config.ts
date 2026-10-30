import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Cobertura mínima exigida en sesión, API, horas y reservas (DoD: ≥ 70 % en lo tocado).
const MINIMO = { lines: 70, functions: 70, branches: 70, statements: 70 };

/**
 * Escribe dist/.vite/modulos.json: por cada chunk, sus módulos (rutas relativas a web/) y sus imports
 * estáticos. Lo lee scripts/verificar-carga.mjs para comprobar la carga diferida de las pantallas.
 */
function informeDeModulos(): Plugin {
  let raiz = '';
  // Vite entrega las rutas con «/» también en Windows.
  const relativo = (id: string) => (id.startsWith(`${raiz}/`) ? id.slice(raiz.length + 1) : id);
  return {
    name: 'flotaagil:informe-de-modulos',
    apply: 'build',
    configResolved(config) {
      raiz = config.root;
    },
    generateBundle(_opciones, paquete) {
      const chunks = Object.values(paquete)
        .filter((salida) => salida.type === 'chunk')
        .map((chunk) => ({
          archivo: chunk.fileName,
          entrada: chunk.isEntry,
          dinamico: chunk.isDynamicEntry,
          fachada: chunk.facadeModuleId ? relativo(chunk.facadeModuleId) : null,
          modulos: chunk.moduleIds.filter((id) => !id.startsWith('\0')).map(relativo),
          imports: chunk.imports,
        }));
      this.emitFile({ type: 'asset', fileName: '.vite/modulos.json', source: JSON.stringify({ chunks }, null, 2) });
    },
  };
}

export default defineConfig({
  plugins: [react(), informeDeModulos()],
  build: { manifest: true },
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
        'src/hora/**': MINIMO,
        'src/reservas/**': MINIMO,
        'src/formularios/**': MINIMO,
        'src/entorno.ts': MINIMO,
      },
    },
  },
});
