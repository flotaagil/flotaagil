/**
 * Renovación del access con la cookie del refresh (POST /api/auth/refresh/).
 *
 * El refresh rota y deja el anterior en la lista negra, y la cookie es la misma para todas las pestañas:
 *
 * - En una pestaña, las renovaciones simultáneas comparten una sola operación (la que esté en curso).
 * - Entre pestañas, con Web Locks (contexto seguro: HTTPS o localhost), las renovaciones van en serie bajo
 *   el lock NOMBRE_LOCK; cada una envía la cookie que dejó la anterior y ninguna recibe 401.
 * - Sin Web Locks (plan B, de mejor esfuerzo): si la renovación responde 401, se espera entre 300 y 600 ms
 *   al azar y se reintenta UNA vez, por si otra pestaña acababa de rotar la cookie. Si la cookie todavía no
 *   se actualizó (caso 4b), el reintento también recibe 401 y la pestaña queda anónima: sin más reintentos.
 *
 * El backend responde el 401 sin Set-Cookie, así que un rechazo nunca borra la cookie que otra pestaña ya
 * renovó. Mientras exista la marca de logout pendiente no se renueva.
 */

import { auth, leerAccess } from '../api/auth';
import { leerCodigo, motivoDeFalla, type MotivoFalla } from '../api/errores';
import type { Entorno } from './entorno';
import type { Marca } from './marca';

/** Lock compartido por la renovación y el logout. */
export const NOMBRE_LOCK = 'flotaagil-sesion';
export const ESPERA_MINIMA_MS = 300;
export const ESPERA_MAXIMA_MS = 600;

export type MotivoSinSesion = 'sesion_invalida' | 'sesion_expirada' | 'origen_no_permitido' | 'logout_pendiente';

export type ResultadoRenovacion =
  | { tipo: 'ok'; access: string }
  | { tipo: 'sin_sesion'; motivo: MotivoSinSesion }
  | { tipo: 'error'; motivo: MotivoFalla };

const LOGOUT_PENDIENTE: ResultadoRenovacion = { tipo: 'sin_sesion', motivo: 'logout_pendiente' };

async function pedirRefresh(e: Entorno): Promise<ResultadoRenovacion> {
  let respuesta: Response;
  try {
    respuesta = await auth.refresh(e);
  } catch {
    return { tipo: 'error', motivo: 'red' };
  }
  if (respuesta.ok) return { tipo: 'ok', access: await leerAccess(respuesta) };
  if (respuesta.status === 401) {
    const codigo = await leerCodigo(respuesta);
    return { tipo: 'sin_sesion', motivo: codigo === 'sesion_expirada' ? 'sesion_expirada' : 'sesion_invalida' };
  }
  if (respuesta.status === 403) return { tipo: 'sin_sesion', motivo: 'origen_no_permitido' };
  return { tipo: 'error', motivo: motivoDeFalla(respuesta.status) };
}

function esperaAlAzar(e: Entorno): number {
  return ESPERA_MINIMA_MS + Math.floor(e.azar() * (ESPERA_MAXIMA_MS - ESPERA_MINIMA_MS + 1));
}

export function crearRenovador(e: Entorno, marca: Marca): () => Promise<ResultadoRenovacion> {
  let enCurso: Promise<ResultadoRenovacion> | null = null;

  async function renovarBajoLock(): Promise<ResultadoRenovacion> {
    // Otra pestaña pudo cerrar la sesión mientras esperábamos el lock.
    if (marca.existe()) return LOGOUT_PENDIENTE;
    return pedirRefresh(e);
  }

  async function renovarConPlanB(): Promise<ResultadoRenovacion> {
    const primero = await pedirRefresh(e);
    if (primero.tipo !== 'sin_sesion' || primero.motivo === 'origen_no_permitido') return primero;
    await e.esperar(esperaAlAzar(e));
    if (marca.existe()) return LOGOUT_PENDIENTE;
    // Único reintento: si vuelve a fallar, el resultado es definitivo.
    return pedirRefresh(e);
  }

  async function ejecutar(): Promise<ResultadoRenovacion> {
    if (marca.existe()) return LOGOUT_PENDIENTE;
    return e.locks ? e.locks.request(NOMBRE_LOCK, renovarBajoLock) : renovarConPlanB();
  }

  return function renovar() {
    enCurso ??= ejecutar().finally(() => {
      enCurso = null;
    });
    return enCurso;
  };
}
