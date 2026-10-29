import { describe, expect, it } from 'vitest';
import { MENSAJES } from '../api/errores';
import { crearAlmacen, crearBus, crearEntorno, crearLocks, vaciar } from '../pruebas/entornoFalso';
import { ServidorAuthFalso } from '../pruebas/servidorAuthFalso';
import type { Almacen } from './entorno';
import { CLAVE_LOGOUT_PENDIENTE } from './marca';
import { crearSesion } from './sesion';

function preparar(opciones: Partial<Parameters<typeof crearEntorno>[0]> = {}) {
  const servidor = new ServidorAuthFalso();
  const { entorno, volverLaConexion } = crearEntorno({ servidor, locks: crearLocks(), ...opciones });
  return { servidor, entorno, volverLaConexion, sesion: crearSesion(entorno) };
}

describe('login', () => {
  it('deja el access en memoria y el refresh en la cookie', async () => {
    const { sesion, servidor } = preparar();
    expect(await sesion.login('despacho@andes.example', 'clave')).toEqual({ ok: true });
    expect(sesion.estado()).toMatchObject({ fase: 'autenticada', usuario: { rol: 'DESPACHADOR' } });
    expect(sesion.access()).toMatch(/^A/);
    expect(servidor.frasco.refresh).toMatch(/^R/);
  });

  it.each([
    ['despacho@andes.example', 'mala', MENSAJES.credenciales_invalidas],
    ['bloqueada@andes.example', 'clave', MENSAJES.cuenta_bloqueada],
    ['conductor@andes.example', 'clave', MENSAJES.rol_no_permitido],
  ])('%s con %s → mensaje por código', async (email, password, mensaje) => {
    const { sesion } = preparar();
    expect(await sesion.login(email, password)).toEqual({ ok: false, mensaje });
    expect(sesion.estado().fase).toBe('inicial');
    expect(sesion.access()).toBeNull();
  });

  it('429 y origen no permitido', async () => {
    const { sesion, servidor } = preparar();
    servidor.limitarLogin = true;
    expect(await sesion.login('despacho@andes.example', 'clave')).toEqual({ ok: false, mensaje: MENSAJES.throttled });
    servidor.limitarLogin = false;
    servidor.rechazarOrigen = true;
    expect(await sesion.login('despacho@andes.example', 'clave')).toEqual({
      ok: false,
      mensaje: MENSAJES.origen_no_permitido,
    });
  });

  it('sin conexión', async () => {
    const { sesion, servidor } = preparar();
    servidor.enLinea = false;
    expect(await sesion.login('despacho@andes.example', 'clave')).toEqual({ ok: false, mensaje: MENSAJES.sin_conexion });
  });
});

describe('refresh silencioso al iniciar', () => {
  it('con cookie vigente queda autenticada sin pedir el login', async () => {
    const { sesion, servidor } = preparar();
    servidor.sembrarSesion('admin@andes.example');
    const fases: string[] = [];
    sesion.suscribir(() => fases.push(sesion.estado().fase));
    await sesion.iniciar();
    expect(fases).toEqual(['cargando', 'autenticada']);
    expect(sesion.estado()).toMatchObject({ usuario: { rol: 'ADMINISTRADOR' } });
    expect(servidor.cuenta('POST /api/auth/refresh/')).toBe(1);
    expect(servidor.cuenta('GET /api/auth/yo/')).toBe(1);
  });

  it('sin cookie queda anónima y sin aviso', async () => {
    const { sesion } = preparar();
    await sesion.iniciar();
    expect(sesion.estado()).toEqual({ fase: 'anonima', aviso: null });
  });

  it('se hace una sola vez aunque se llame varias veces', async () => {
    const { sesion, servidor } = preparar();
    servidor.sembrarSesion();
    await Promise.all([sesion.iniciar(), sesion.iniciar(), sesion.iniciar()]);
    expect(servidor.cuenta('POST /api/auth/refresh/')).toBe(1);
  });

  it('si /yo falla por red queda anónima', async () => {
    const { servidor, entorno } = preparar();
    servidor.sembrarSesion();
    const fetchDelServidor = entorno.fetch;
    entorno.fetch = (entrada, init) => {
      const url = entrada instanceof Request ? entrada.url : entrada;
      if (url.endsWith('/api/auth/yo/')) return Promise.reject(new TypeError('Failed to fetch'));
      return fetchDelServidor(entrada, init);
    };
    const sesion = crearSesion(entorno);
    await sesion.iniciar();
    expect(sesion.estado()).toEqual({ fase: 'anonima', aviso: null });
    expect(sesion.access()).toBeNull();
  });
});

describe('logout', () => {
  async function conSesion(opciones: Partial<Parameters<typeof crearEntorno>[0]> = {}) {
    const contexto = preparar(opciones);
    await contexto.sesion.login('despacho@andes.example', 'clave');
    return contexto;
  }

  it('confirmado (204): limpia la sesión, borra la cookie y no deja marca', async () => {
    const { sesion, servidor, entorno } = await conSesion();
    const refresh = servidor.frasco.refresh;
    expect(await sesion.logout()).toEqual({ confirmado: true });
    expect(sesion.estado()).toEqual({ fase: 'anonima', aviso: null });
    expect(sesion.access()).toBeNull();
    expect(servidor.frasco.refresh).toBeNull();
    expect(entorno.almacen!.getItem(CLAVE_LOGOUT_PENDIENTE)).toBeNull();
    // El refresh quedó invalidado en el servidor.
    servidor.frasco.refresh = refresh;
    expect((await entorno.fetch(`${entorno.origen}/api/auth/refresh/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(401);
  });

  it('toma el mismo Web Lock que la renovación', async () => {
    const locks = crearLocks();
    const { sesion } = await conSesion({ locks });
    const antes = locks.solicitudes;
    await sesion.logout();
    expect(locks.solicitudes).toBe(antes + 1);
  });

  it('con falla de red: limpia igual, deja la marca, avisa y no dice que se revocó', async () => {
    const { sesion, servidor, entorno } = await conSesion();
    servidor.enLinea = false;
    expect(await sesion.logout()).toEqual({ confirmado: false });
    expect(sesion.access()).toBeNull();
    expect(sesion.estado()).toEqual({ fase: 'anonima', aviso: MENSAJES.logout_no_confirmado });
    expect(MENSAJES.logout_no_confirmado).not.toMatch(/revoc/i);
    expect(entorno.almacen!.getItem(CLAVE_LOGOUT_PENDIENTE)).not.toBeNull();
    // La cookie sigue en el navegador: el servidor no se enteró.
    expect(servidor.frasco.refresh).not.toBeNull();
  });

  it('con la marca no hay refresh silencioso: al cargar se reintenta el logout y se borra la marca con el 204', async () => {
    const { sesion, servidor, entorno } = await conSesion();
    servidor.enLinea = false;
    await sesion.logout();
    servidor.enLinea = true;
    servidor.llamadas = [];

    // «Recarga»: nueva sesión en la misma pestaña, mismo localStorage y misma cookie.
    const recargada = crearSesion(entorno);
    await recargada.iniciar();
    expect(servidor.cuenta('POST /api/auth/refresh/')).toBe(0);
    expect(servidor.cuenta('POST /api/auth/logout/')).toBe(1);
    expect(recargada.estado()).toEqual({ fase: 'anonima', aviso: null });
    expect(entorno.almacen!.getItem(CLAVE_LOGOUT_PENDIENTE)).toBeNull();
    expect(servidor.frasco.refresh).toBeNull();
  });

  it('si al cargar el logout sigue sin confirmarse, queda anónima con el aviso y sin entrar', async () => {
    const { sesion, servidor, entorno } = await conSesion();
    servidor.enLinea = false;
    await sesion.logout();
    const recargada = crearSesion(entorno);
    await recargada.iniciar();
    expect(recargada.estado()).toEqual({ fase: 'anonima', aviso: MENSAJES.logout_no_confirmado });
    expect(servidor.cuenta('POST /api/auth/refresh/')).toBe(0);
  });

  it('se reintenta al volver la conexión', async () => {
    const { sesion, servidor, entorno, volverLaConexion } = await conSesion();
    servidor.enLinea = false;
    await sesion.logout();
    servidor.enLinea = true;
    volverLaConexion();
    await vaciar();
    expect(entorno.almacen!.getItem(CLAVE_LOGOUT_PENDIENTE)).toBeNull();
    expect(sesion.estado()).toEqual({ fase: 'anonima', aviso: null });
  });

  it('204 perdido: el servidor cerró la sesión pero el navegador no lo supo; el reintento es idempotente', async () => {
    const { sesion, servidor, entorno, volverLaConexion } = await conSesion();
    servidor.perderRespuestaLogout = true;
    expect(await sesion.logout()).toEqual({ confirmado: false });
    expect(entorno.almacen!.getItem(CLAVE_LOGOUT_PENDIENTE)).not.toBeNull();
    expect(servidor.frasco.refresh).not.toBeNull(); // el Set-Cookie de borrado se perdió
    servidor.perderRespuestaLogout = false;
    volverLaConexion();
    await vaciar();
    expect(entorno.almacen!.getItem(CLAVE_LOGOUT_PENDIENTE)).toBeNull();
    expect(servidor.frasco.refresh).toBeNull();
  });

  it('un login nuevo con la marca intenta antes el logout pendiente', async () => {
    const { sesion, servidor, entorno } = await conSesion();
    servidor.enLinea = false;
    await sesion.logout();
    servidor.enLinea = true;
    servidor.llamadas = [];
    expect(await sesion.login('admin@andes.example', 'clave')).toEqual({ ok: true });
    expect(servidor.llamadas.slice(0, 2)).toEqual(['POST /api/auth/logout/', 'POST /api/auth/token/']);
    expect(entorno.almacen!.getItem(CLAVE_LOGOUT_PENDIENTE)).toBeNull();
  });

  it('sin localStorage: la marca queda en memoria y bloquea el refresh en esta pestaña', async () => {
    const { sesion, servidor } = await conSesion({ almacen: null });
    servidor.enLinea = false;
    expect(await sesion.logout()).toEqual({ confirmado: false });
    servidor.enLinea = true;
    servidor.llamadas = [];
    expect(await sesion.renovarTrasRechazo()).toBeNull();
    expect(servidor.cuenta('POST /api/auth/refresh/')).toBe(0);
  });

  it('con un localStorage que lanza errores no se rompe y usa la memoria', async () => {
    const roto: Almacen = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const { sesion, servidor, volverLaConexion } = await conSesion({ almacen: roto });
    servidor.enLinea = false;
    expect(await sesion.logout()).toEqual({ confirmado: false });
    expect(sesion.estado()).toEqual({ fase: 'anonima', aviso: MENSAJES.logout_no_confirmado });
    servidor.enLinea = true;
    volverLaConexion();
    await vaciar();
    expect(sesion.estado()).toEqual({ fase: 'anonima', aviso: null });
    expect(servidor.frasco.refresh).toBeNull();
  });
});

describe('aviso a las otras pestañas', () => {
  it('el logout cierra la otra pestaña', async () => {
    const servidor = new ServidorAuthFalso();
    const bus = crearBus();
    const almacen = crearAlmacen();
    const locks = crearLocks();
    const a = crearSesion(crearEntorno({ servidor, bus, almacen, locks }).entorno);
    const b = crearSesion(crearEntorno({ servidor, bus, almacen, locks }).entorno);
    await a.login('despacho@andes.example', 'clave');
    await b.iniciar();
    expect(b.estado().fase).toBe('autenticada');
    await a.logout();
    await vaciar();
    expect(b.estado()).toEqual({ fase: 'anonima', aviso: null });
    expect(b.access()).toBeNull();
  });

  it('sin localStorage la marca viaja por el canal y la confirmación la borra', async () => {
    const servidor = new ServidorAuthFalso();
    const bus = crearBus();
    const locks = crearLocks();
    const a = crearSesion(crearEntorno({ servidor, bus, almacen: null, locks }).entorno);
    const entornoB = crearEntorno({ servidor, bus, almacen: null, locks });
    const b = crearSesion(entornoB.entorno);
    await a.login('despacho@andes.example', 'clave');
    await b.iniciar();
    servidor.enLinea = false;
    await a.logout();
    await vaciar();
    expect(b.estado()).toEqual({ fase: 'anonima', aviso: MENSAJES.logout_no_confirmado });
    servidor.enLinea = true;
    servidor.llamadas = [];
    // B tiene la marca en memoria: no renueva aunque la cookie siga.
    expect(await b.renovarTrasRechazo()).toBeNull();
    expect(servidor.cuenta('POST /api/auth/refresh/')).toBe(0);
    entornoB.volverLaConexion();
    await vaciar();
    expect(b.estado()).toEqual({ fase: 'anonima', aviso: null });
    await vaciar();
    expect(a.estado()).toEqual({ fase: 'anonima', aviso: null });
  });
});
