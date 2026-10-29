import { matchRoutes, type RouteObject } from 'react-router';

export const INICIO = '/';

/** Rutas a las que no tiene sentido volver después del login. */
const NO_DESTINO = new Set(['*', '/login']);

/**
 * Destino seguro para `?volver=` después del login.
 *
 * Se resuelve con `new URL(volver, origen)` y se exige el mismo origen (descarta https://evil.example,
 * //evil.example, /\evil.example, javascript:…). Además la ruta debe existir en la tabla de React Router
 * (matchRoutes), así las pantallas nuevas quedan cubiertas sin listas escritas a mano. Se devuelve solo
 * pathname + search + hash. Cualquier otra cosa lleva a Inicio.
 */
export function destinoSeguro(volver: string | null, rutas: RouteObject[], origen: string): string {
  if (!volver) return INICIO;
  let url: URL;
  try {
    url = new URL(volver, origen);
  } catch {
    return INICIO;
  }
  if (url.origin !== origen) return INICIO;
  const coincidencias = matchRoutes(rutas, url.pathname);
  const hoja = coincidencias?.at(-1)?.route;
  if (!hoja || (hoja.path && NO_DESTINO.has(hoja.path))) return INICIO;
  return `${url.pathname}${url.search}${url.hash}`;
}
