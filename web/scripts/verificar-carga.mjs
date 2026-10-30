/**
 * Verifica la carga diferida en el resultado del build (dist/.vite/modulos.json, que escribe el plugin
 * `informeDeModulos` de vite.config.ts):
 *
 * 1. Las raíces y pantallas (sesión, marco del panel, páginas) son entradas de chunks dinámicos (lazy).
 * 2. Desde cada punto de partida (el paquete inicial o una pantalla), los módulos que se cargan por imports
 *    estáticos no incluyen lo prohibido para él: el paquete inicial y las rutas sin sesión no cargan nada del
 *    panel ni de la sesión; el login no carga reservas. Tampoco a través de componentes o proveedores
 *    compartidos, porque se sigue toda la cadena de imports estáticos.
 * 3. Los módulos vigilados existen en algún chunk (la verificación no pasa sin estar revisando nada).
 *
 * Uso: node scripts/verificar-carga.mjs [ruta/a/modulos.json]. Sale con código 1 si algo falla.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Panel y sesión: lo que una ruta sin sesión no debe cargar. */
export const PANEL_Y_SESION =
  /^src\/(sesion|reservas)\/|^src\/api\/(cliente|auth)\.ts$|^src\/componentes\/Layout\.tsx$|^src\/rutas\/RutaAutenticada\.tsx$|^src\/paginas\/(Login|Inicio)\.tsx$/;
export const RESERVAS = /^src\/reservas\//;

/** Módulos que deben llegar con lazy (entrada de un chunk dinámico). */
export const DIFERIDOS = [
  'src/sesion/RaizSesion.tsx',
  'src/rutas/RutaAutenticada.tsx',
  'src/componentes/Layout.tsx',
  'src/paginas/Login.tsx',
  'src/paginas/NoEncontrada.tsx',
  'src/paginas/Inicio.tsx',
  'src/reservas/paginas/Listado.tsx',
  'src/reservas/paginas/Nueva.tsx',
  'src/reservas/paginas/Detalle.tsx',
  'src/reservas/paginas/Editar.tsx',
];

/** Desde dónde se mira y qué no puede cargar. `desde: null` = el paquete inicial. */
export const REGLAS = [
  { desde: null, nombre: 'paquete inicial', prohibido: PANEL_Y_SESION },
  { desde: 'src/paginas/NoEncontrada.tsx', nombre: 'página no encontrada', prohibido: PANEL_Y_SESION },
  { desde: 'src/paginas/Login.tsx', nombre: 'login', prohibido: RESERVAS },
];

/** Deben aparecer en el build: si no, la regla que los prohíbe no estaría probando nada. */
export const VIGILADOS = [
  ['src/sesion/', /^src\/sesion\//],
  ['src/reservas/', RESERVAS],
];

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

function archivoDe(chunks, desde) {
  if (desde === null) return chunks.find((chunk) => chunk.entrada)?.archivo;
  return chunks.find((chunk) => chunk.dinamico && chunk.fachada === desde)?.archivo;
}

/** Devuelve la lista de problemas (vacía si todo está bien). */
export function verificar({ chunks }, { diferidos = DIFERIDOS, reglas = REGLAS, vigilados = VIGILADOS } = {}) {
  const problemas = [];
  const entradas = chunks.filter((chunk) => chunk.entrada);
  if (entradas.length !== 1) problemas.push(`Se esperaba un solo chunk de entrada y hay ${entradas.length}.`);

  for (const modulo of diferidos) {
    if (!archivoDe(chunks, modulo)) problemas.push(`${modulo} no se carga con lazy (no es la entrada de un chunk dinámico).`);
  }
  for (const { desde, nombre, prohibido } of reglas) {
    const archivo = archivoDe(chunks, desde);
    if (!archivo) continue; // ya informado arriba
    const encontrados = cierreEstatico(chunks, archivo).filter((modulo) => prohibido.test(modulo));
    if (encontrados.length) problemas.push(`${nombre} carga módulos prohibidos: ${encontrados.join(', ')}.`);
  }
  for (const [nombre, patron] of vigilados) {
    if (!chunks.some((chunk) => chunk.modulos.some((modulo) => patron.test(modulo)))) {
      problemas.push(`No hay módulos de ${nombre} en el build: la verificación no estaría revisando nada.`);
    }
  }
  return problemas;
}

/** Módulos propios (src/) que carga cada punto de partida, para el informe. */
export function informe({ chunks }, reglas = REGLAS) {
  return reglas.map(({ desde, nombre }) => {
    const archivo = archivoDe(chunks, desde);
    const modulos = archivo ? cierreEstatico(chunks, archivo).filter((m) => m.startsWith('src/')) : [];
    return { nombre, archivo, modulos };
  });
}

function principal() {
  const ruta = process.argv[2] ?? 'dist/.vite/modulos.json';
  const datos = JSON.parse(readFileSync(ruta, 'utf8'));
  const problemas = verificar(datos);
  if (problemas.length) {
    console.error('verificar-carga: FALLA');
    for (const problema of problemas) console.error(`  - ${problema}`);
    process.exit(1);
  }
  console.log(`verificar-carga: ok. ${DIFERIDOS.length} módulos con lazy; reglas cumplidas:`);
  for (const { nombre, archivo, modulos } of informe(datos)) {
    console.log(`  ${nombre} (${archivo}): ${modulos.length} módulos propios`);
    console.log(`    ${modulos.join(', ')}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) principal();
