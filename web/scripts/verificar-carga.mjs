/**
 * Verifica la carga diferida en el resultado del build (dist/.vite/modulos.json, que escribe el plugin
 * `informeDeModulos` de vite.config.ts):
 *
 * 1. Cada pantalla (src/paginas/*, src/reservas/paginas/*) es la entrada de un chunk dinámico (lazy).
 * 2. Ni el paquete inicial ni las rutas públicas (login, no encontrada) cargan, por imports estáticos,
 *    módulos de src/reservas/: tampoco a través de componentes o proveedores compartidos.
 * 3. Los módulos de reservas existen en algún chunk (la verificación no pasa sin estar revisando nada).
 *
 * Uso: node scripts/verificar-carga.mjs [ruta/a/modulos.json]. Sale con código 1 si algo falla.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PANTALLAS_PUBLICAS = ['src/paginas/Login.tsx', 'src/paginas/NoEncontrada.tsx'];
export const PANTALLAS_DIFERIDAS = [
  ...PANTALLAS_PUBLICAS,
  'src/paginas/Inicio.tsx',
  'src/reservas/paginas/Listado.tsx',
  'src/reservas/paginas/Nueva.tsx',
  'src/reservas/paginas/Detalle.tsx',
  'src/reservas/paginas/Editar.tsx',
];
export const PROHIBIDO_EN_PUBLICAS = /^src\/reservas\//;

/** Módulos que se cargan al abrir un chunk: el chunk y todos sus imports estáticos (no los dinámicos). */
export function cierreEstatico(chunks, inicio) {
  const porArchivo = new Map(chunks.map((chunk) => [chunk.archivo, chunk]));
  const vistos = new Set();
  const pendientes = [inicio];
  while (pendientes.length) {
    const archivo = pendientes.pop();
    if (vistos.has(archivo)) continue;
    vistos.add(archivo);
    pendientes.push(...(porArchivo.get(archivo)?.imports ?? []));
  }
  return [...vistos].flatMap((archivo) => porArchivo.get(archivo)?.modulos ?? []);
}

/** Devuelve la lista de problemas (vacía si todo está bien). */
export function verificar({ chunks }) {
  const problemas = [];
  const entradas = chunks.filter((chunk) => chunk.entrada);
  if (entradas.length !== 1) problemas.push(`Se esperaba un solo chunk de entrada y hay ${entradas.length}.`);

  const porFachada = new Map(chunks.filter((c) => c.dinamico && c.fachada).map((c) => [c.fachada, c]));
  for (const pantalla of PANTALLAS_DIFERIDAS) {
    if (!porFachada.has(pantalla)) problemas.push(`${pantalla} no se carga con lazy (no es la entrada de un chunk dinámico).`);
  }

  const revisar = [
    ...entradas.map((chunk) => ['paquete inicial', chunk.archivo]),
    ...PANTALLAS_PUBLICAS.filter((p) => porFachada.has(p)).map((p) => [p, porFachada.get(p).archivo]),
  ];
  for (const [nombre, archivo] of revisar) {
    const prohibidos = cierreEstatico(chunks, archivo).filter((modulo) => PROHIBIDO_EN_PUBLICAS.test(modulo));
    if (prohibidos.length) problemas.push(`${nombre} carga módulos de reservas: ${prohibidos.join(', ')}.`);
  }

  if (!chunks.some((chunk) => chunk.modulos.some((modulo) => PROHIBIDO_EN_PUBLICAS.test(modulo)))) {
    problemas.push('No hay módulos de src/reservas/ en el build: la verificación no estaría revisando nada.');
  }
  return problemas;
}

function principal() {
  const ruta = process.argv[2] ?? 'dist/.vite/modulos.json';
  const informe = JSON.parse(readFileSync(ruta, 'utf8'));
  const problemas = verificar(informe);
  if (problemas.length) {
    console.error('verificar-carga: FALLA');
    for (const problema of problemas) console.error(`  - ${problema}`);
    process.exit(1);
  }
  const entrada = informe.chunks.find((chunk) => chunk.entrada);
  const publicas = PANTALLAS_PUBLICAS.length;
  console.log(
    `verificar-carga: ok. ${PANTALLAS_DIFERIDAS.length} pantallas con lazy; el paquete inicial ` +
      `(${cierreEstatico(informe.chunks, entrada.archivo).length} módulos) y ${publicas} rutas públicas sin módulos de reservas.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) principal();
