/**
 * Piezas falsas del navegador para las pruebas: Web Locks (cola FIFO por nombre), BroadcastChannel (bus
 * compartido), localStorage (Map, o uno que lanza error) y un reloj cuya espera controla la prueba.
 */

import type { Almacen, Canal, Entorno, Locks, MensajeSesion } from '../entorno';
import type { ServidorAuthFalso } from './servidorAuthFalso';

export const ORIGEN = 'http://localhost:3000';

export function crearLocks(): Locks & { solicitudes: number } {
  const colas = new Map<string, Promise<unknown>>();
  const locks = {
    solicitudes: 0,
    request<T>(nombre: string, tarea: () => Promise<T>): Promise<T> {
      locks.solicitudes++;
      const anterior = colas.get(nombre) ?? Promise.resolve();
      const actual = anterior.then(tarea, tarea);
      colas.set(
        nombre,
        actual.then(
          () => undefined,
          () => undefined,
        ),
      );
      return actual;
    },
  };
  return locks;
}

export function crearBus() {
  const miembros = new Set<{ oyente: ((m: MensajeSesion) => void) | null }>();
  return {
    crearCanal(): Canal {
      const miembro: { oyente: ((m: MensajeSesion) => void) | null } = { oyente: null };
      miembros.add(miembro);
      return {
        enviar(mensaje) {
          // Como BroadcastChannel: llega a las demás pestañas, no a la que envía, y de forma asíncrona.
          for (const otro of miembros) {
            if (otro !== miembro) queueMicrotask(() => otro.oyente?.(structuredClone(mensaje)));
          }
        },
        alRecibir(oyente) {
          miembro.oyente = oyente;
        },
        cerrar() {
          miembros.delete(miembro);
        },
      };
    },
  };
}

export function crearAlmacen(): Almacen & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => void datos.set(clave, valor),
    removeItem: (clave) => void datos.delete(clave),
  };
}

/** Reloj de la espera del plan B: la prueba decide cuándo termina cada espera. */
export function crearReloj() {
  const esperas: { ms: number; terminar: () => void }[] = [];
  return {
    esperas,
    esperar(ms: number) {
      return new Promise<void>((terminar) => esperas.push({ ms, terminar }));
    },
    /** Termina la primera espera pendiente. */
    avanzar() {
      const espera = esperas.shift();
      if (!espera) throw new Error('No hay esperas pendientes.');
      espera.terminar();
      return espera.ms;
    },
  };
}

interface Opciones {
  /** Cualquier servidor falso con `fetch` (el de auth, el del portal). */
  servidor: Pick<ServidorAuthFalso, 'fetch'>;
  locks?: Locks | null;
  almacen?: Almacen | null;
  bus?: ReturnType<typeof crearBus> | null;
  reloj?: ReturnType<typeof crearReloj>;
  azar?: number;
  /** Hora fija para `ahora()`; por defecto la real. */
  ahora?: number;
}

export function crearEntorno({ servidor, locks = null, almacen = crearAlmacen(), bus = null, reloj, azar = 0.5, ahora }: Opciones) {
  const oyentesConexion = new Set<() => void>();
  const entorno: Entorno = {
    origen: ORIGEN,
    fetch: servidor.fetch,
    locks,
    almacen,
    crearCanal: () => bus?.crearCanal() ?? null,
    esperar: reloj ? reloj.esperar : () => Promise.resolve(),
    azar: () => azar,
    ahora: () => ahora ?? Date.now(),
    alVolverLaConexion(oyente) {
      oyentesConexion.add(oyente);
      return () => oyentesConexion.delete(oyente);
    },
  };
  return {
    entorno,
    /** Simula el evento `online`. */
    volverLaConexion: () => oyentesConexion.forEach((oyente) => oyente()),
  };
}

/** Deja correr las promesas y microtareas pendientes (sin temporizadores). */
export async function vaciar(veces = 20) {
  for (let i = 0; i < veces; i++) await Promise.resolve();
}
