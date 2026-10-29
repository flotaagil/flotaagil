/**
 * Sesión del panel en una pestaña.
 *
 * - El access vive solo en memoria; el refresh, en la cookie httpOnly que maneja el navegador.
 * - `iniciar()` hace el refresh silencioso (solo lo llaman las rutas del panel y /login) y no se decide si
 *   mostrar el login hasta que termina.
 * - `renovarTrasRechazo()` lo usa el cliente de la API ante un 401: operación compartida por pestaña.
 * - sesion_invalida y sesion_expirada se tratan igual: se limpia la sesión y se vuelve a /login con
 *   «Tu sesión terminó».
 * - `logout()` toma el mismo lock que la renovación y avisa a las otras pestañas. Si el servidor no confirma
 *   (204), la sesión local se limpia igual y queda la marca de logout pendiente: mientras exista, ninguna
 *   pestaña renueva y el logout se reintenta al cargar y al volver la conexión.
 */

import { auth, leerSesion, leerUsuario, type Usuario } from '../api/auth';
import { leerCodigo, MENSAJES, mensajeDeError } from '../api/errores';
import type { Entorno, MensajeSesion } from './entorno';
import { crearMarca } from './marca';
import { crearRenovador, NOMBRE_LOCK, type MotivoSinSesion } from './renovar';

export type EstadoSesion =
  | { fase: 'inicial' }
  | { fase: 'cargando' }
  | { fase: 'anonima'; aviso: string | null }
  | { fase: 'autenticada'; usuario: Usuario };

export type ResultadoLogin = { ok: true } | { ok: false; mensaje: string };

export interface Sesion {
  estado(): EstadoSesion;
  suscribir(oyente: () => void): () => void;
  /** Se llama cada vez que la sesión se limpia (p. ej. para vaciar la caché de consultas). */
  alLimpiar(oyente: () => void): () => void;
  access(): string | null;
  iniciar(): Promise<void>;
  login(email: string, password: string): Promise<ResultadoLogin>;
  logout(): Promise<{ confirmado: boolean }>;
  renovarTrasRechazo(): Promise<string | null>;
  descartarAviso(): void;
  destruir(): void;
}

function avisoDeMotivo(motivo: MotivoSinSesion): string {
  if (motivo === 'origen_no_permitido') return MENSAJES.origen_no_permitido;
  return MENSAJES.sesion_terminada;
}

export function crearSesion(e: Entorno): Sesion {
  let estado: EstadoSesion = { fase: 'inicial' };
  let access: string | null = null;
  let inicio: Promise<void> | null = null;
  const oyentes = new Set<() => void>();
  const oyentesLimpieza = new Set<() => void>();
  const marca = crearMarca(e.almacen);
  const renovar = crearRenovador(e, marca);
  const canal = e.crearCanal();

  function fijar(nuevo: EstadoSesion) {
    estado = nuevo;
    oyentes.forEach((oyente) => oyente());
  }

  function limpiar(aviso: string | null) {
    access = null;
    oyentesLimpieza.forEach((oyente) => oyente());
    fijar({ fase: 'anonima', aviso });
  }

  /** POST /api/auth/logout/: true solo si el servidor confirma con 204. */
  async function enviarLogout(): Promise<boolean> {
    try {
      return (await auth.logout(e)).status === 204;
    } catch {
      return false;
    }
  }

  function conLock<T>(tarea: () => Promise<T>): Promise<T> {
    return e.locks ? e.locks.request(NOMBRE_LOCK, tarea) : tarea();
  }

  async function reintentarLogoutPendiente(): Promise<void> {
    if (!marca.existe()) return;
    const confirmado = await conLock(async () => {
      if (!marca.existe()) return true; // otra pestaña ya lo confirmó
      const ok = await enviarLogout();
      if (ok) marca.borrar();
      return ok;
    });
    if (!confirmado) return;
    canal?.enviar({ tipo: 'logout_confirmado' });
    if (estado.fase === 'anonima' && estado.aviso === MENSAJES.logout_no_confirmado) {
      fijar({ fase: 'anonima', aviso: null });
    }
  }

  function alRecibir(mensaje: MensajeSesion) {
    if (mensaje.tipo === 'logout') {
      // Sin localStorage la marca solo viaja por aquí.
      if (mensaje.pendiente) marca.poner();
      if (estado.fase === 'autenticada' || estado.fase === 'cargando') {
        limpiar(mensaje.pendiente ? MENSAJES.logout_no_confirmado : null);
      }
    } else if (mensaje.tipo === 'logout_confirmado') {
      marca.borrar();
      if (estado.fase === 'anonima' && estado.aviso === MENSAJES.logout_no_confirmado) {
        fijar({ fase: 'anonima', aviso: null });
      }
    }
  }

  canal?.alRecibir(alRecibir);
  const quitarOyenteConexion = e.alVolverLaConexion(() => void reintentarLogoutPendiente());

  async function arrancar(): Promise<void> {
    fijar({ fase: 'cargando' });
    if (marca.existe()) {
      await reintentarLogoutPendiente();
      if (estado.fase === 'cargando') {
        limpiar(marca.existe() ? MENSAJES.logout_no_confirmado : null);
      }
      return;
    }
    const resultado = await renovar();
    if (estado.fase !== 'cargando') return; // p. ej. llegó un logout de otra pestaña
    if (resultado.tipo !== 'ok') {
      limpiar(null);
      return;
    }
    let usuario: Usuario | null = null;
    try {
      const respuesta = await auth.yo(e, resultado.access);
      if (respuesta.ok) usuario = await leerUsuario(respuesta);
    } catch {
      usuario = null;
    }
    if (estado.fase !== 'cargando') return;
    if (!usuario) {
      limpiar(null);
      return;
    }
    access = resultado.access;
    fijar({ fase: 'autenticada', usuario });
  }

  return {
    estado: () => estado,
    suscribir(oyente) {
      oyentes.add(oyente);
      return () => oyentes.delete(oyente);
    },
    alLimpiar(oyente) {
      oyentesLimpieza.add(oyente);
      return () => oyentesLimpieza.delete(oyente);
    },
    access: () => access,

    iniciar() {
      if (estado.fase !== 'inicial') return inicio ?? Promise.resolve();
      inicio = arrancar();
      return inicio;
    },

    async login(email, password) {
      // Si quedó un logout sin confirmar, se intenta antes: el login reemplazará la cookie.
      await reintentarLogoutPendiente();
      let respuesta: Response;
      try {
        respuesta = await auth.login(e, email, password);
      } catch {
        return { ok: false, mensaje: MENSAJES.sin_conexion };
      }
      if (!respuesta.ok) {
        return { ok: false, mensaje: mensajeDeError(await leerCodigo(respuesta), respuesta.status) };
      }
      const datos = await leerSesion(respuesta);
      // El refresh anterior ya no está en el navegador: la marca no tiene nada más que invalidar.
      marca.borrar();
      access = datos.access;
      fijar({ fase: 'autenticada', usuario: datos.usuario });
      return { ok: true };
    },

    async logout() {
      // La sesión local se limpia de inmediato, confirme o no el servidor.
      limpiar(null);
      const confirmado = await conLock(async () => {
        const ok = await enviarLogout();
        if (ok) marca.borrar();
        else marca.poner();
        return ok;
      });
      canal?.enviar({ tipo: 'logout', pendiente: !confirmado });
      if (!confirmado) fijar({ fase: 'anonima', aviso: MENSAJES.logout_no_confirmado });
      return { confirmado };
    },

    async renovarTrasRechazo() {
      if (estado.fase !== 'autenticada') return null;
      const resultado = await renovar();
      if (resultado.tipo === 'ok') {
        if (estado.fase !== 'autenticada') return null;
        access = resultado.access;
        return access;
      }
      if (resultado.tipo === 'sin_sesion' && estado.fase === 'autenticada') {
        limpiar(avisoDeMotivo(resultado.motivo));
      }
      return null;
    },

    descartarAviso() {
      if (estado.fase === 'anonima' && estado.aviso) fijar({ fase: 'anonima', aviso: null });
    },

    destruir() {
      quitarOyenteConexion();
      canal?.cerrar();
      oyentes.clear();
      oyentesLimpieza.clear();
    },
  };
}
