/**
 * Lo que la aplicación usa del navegador (la sesión y el portal), reunido en un objeto para poder reemplazarlo
 * en las pruebas
 * (servidor falso, dos «pestañas» con la misma cookie, locks y canal compartidos, reloj controlado).
 */

export interface Locks {
  request<T>(nombre: string, tarea: () => Promise<T>): Promise<T>;
}

export interface Almacen {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

export interface Canal {
  enviar(mensaje: MensajeSesion): void;
  alRecibir(oyente: (mensaje: MensajeSesion) => void): void;
  cerrar(): void;
}

export type MensajeSesion = { tipo: 'logout'; pendiente: boolean } | { tipo: 'logout_confirmado' };

export interface Entorno {
  /** Origen de la página; la API está en el mismo origen (proxy de Vite o Nginx). */
  origen: string;
  fetch(entrada: Request | string, init?: RequestInit): Promise<Response>;
  /** Web Locks, solo si el contexto es seguro (HTTPS o localhost) y el navegador la tiene. */
  locks: Locks | null;
  /** localStorage, o null si el navegador no lo permite. */
  almacen: Almacen | null;
  crearCanal(): Canal | null;
  esperar(ms: number): Promise<void>;
  /** Número en [0, 1): la espera al azar del plan B. */
  azar(): number;
  /** Hora actual (ms). El portal la usa para la anticipación mínima; las pruebas la fijan. */
  ahora(): number;
  /** Registra un oyente para cuando vuelve la conexión; devuelve cómo quitarlo. */
  alVolverLaConexion(oyente: () => void): () => void;
}

const NOMBRE_CANAL = 'flotaagil-sesion';

function almacenDisponible(): Almacen | null {
  try {
    const almacen = window.localStorage;
    const prueba = '__flotaagil_prueba__';
    almacen.setItem(prueba, '1');
    almacen.removeItem(prueba);
    return almacen;
  } catch {
    return null;
  }
}

export function entornoDelNavegador(): Entorno {
  const locks =
    window.isSecureContext && 'locks' in navigator && navigator.locks
      ? {
          request: <T,>(nombre: string, tarea: () => Promise<T>) =>
            navigator.locks.request(nombre, tarea) as Promise<T>,
        }
      : null;
  return {
    origen: window.location.origin,
    fetch: (entrada, init) => window.fetch(entrada, init),
    locks,
    almacen: almacenDisponible(),
    crearCanal() {
      if (typeof BroadcastChannel === 'undefined') return null;
      const canal = new BroadcastChannel(NOMBRE_CANAL);
      return {
        enviar: (mensaje) => canal.postMessage(mensaje),
        alRecibir: (oyente) => {
          canal.onmessage = (evento: MessageEvent<MensajeSesion>) => oyente(evento.data);
        },
        cerrar: () => canal.close(),
      };
    },
    esperar: (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
    azar: () => Math.random(),
    ahora: () => Date.now(),
    alVolverLaConexion(oyente) {
      window.addEventListener('online', oyente);
      return () => window.removeEventListener('online', oyente);
    },
  };
}
