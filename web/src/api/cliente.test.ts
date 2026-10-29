import { describe, expect, it } from 'vitest';
import { crearEntorno, crearLocks, crearReloj, vaciar } from '../pruebas/entornoFalso';
import { ServidorAuthFalso } from '../pruebas/servidorAuthFalso';
import { crearSesion } from '../sesion/sesion';
import { crearClienteApi } from './cliente';
import { MENSAJES } from './errores';

const REFRESH = 'POST /api/auth/refresh/';
const VIAJES = 'GET /api/viajes/';

async function preparar({ locks = crearLocks() as ReturnType<typeof crearLocks> | null } = {}) {
  const servidor = new ServidorAuthFalso();
  const reloj = crearReloj();
  const { entorno } = crearEntorno({ servidor, locks, reloj });
  const sesion = crearSesion(entorno);
  await sesion.login('despacho@andes.example', 'clave');
  servidor.llamadas = [];
  return { servidor, reloj, entorno, sesion, api: crearClienteApi(entorno, sesion) };
}

describe('cliente de la API', () => {
  it('envía el access de la sesión', async () => {
    const { api, servidor } = await preparar();
    const { response } = await api.GET('/api/viajes/');
    expect(response.status).toBe(200);
    expect(servidor.cuenta(REFRESH)).toBe(0);
  });

  it('ante un 401 renueva y repite la petición una vez', async () => {
    const { api, servidor, sesion } = await preparar();
    const accessViejo = sesion.access();
    servidor.vencerAccess();
    const { response, data } = await api.GET('/api/viajes/');
    expect(response.status).toBe(200);
    expect(data?.count).toBe(0);
    expect(servidor.llamadas).toEqual([VIAJES, REFRESH, VIAJES]);
    expect(sesion.access()).not.toBe(accessViejo);
  });

  it('el reintento conserva el cuerpo de la petición', async () => {
    const { servidor, entorno, sesion } = await preparar();
    servidor.vencerAccess();
    const api = crearClienteApi(entorno, sesion);
    // POST con cuerpo: la copia guardada antes del envío se reutiliza en el reintento.
    const respuesta = await (api.POST as unknown as (ruta: string, opciones: { body: unknown }) => Promise<{ response: Response; data: unknown }>)(
      '/api/viajes/',
      { body: { origen_dir: 'Av. Siempre Viva 742' } },
    );
    expect(respuesta.response.status).toBe(201);
    expect(respuesta.data).toEqual({ recibido: { origen_dir: 'Av. Siempre Viva 742' } });
  });

  it('un 401 en el reintento no vuelve a renovar', async () => {
    const { servidor, entorno, sesion } = await preparar();
    servidor.vencerAccess();
    const fetchDelServidor = entorno.fetch;
    entorno.fetch = async (entrada, init) => {
      const respuesta = await fetchDelServidor(entrada, init);
      // El endpoint rechaza incluso el access recién emitido.
      if (respuesta.ok && entrada instanceof Request && entrada.url.endsWith('/api/viajes/')) {
        return new Response('{"code":"token_not_valid"}', { status: 401 });
      }
      return respuesta;
    };
    const api = crearClienteApi(entorno, sesion);
    const { response } = await api.GET('/api/viajes/');
    expect(response.status).toBe(401);
    expect(servidor.cuenta(REFRESH)).toBe(1);
    expect(servidor.cuenta(VIAJES)).toBe(2);
  });

  it('varias peticiones con 401 a la vez comparten una sola renovación', async () => {
    const { api, servidor } = await preparar();
    servidor.vencerAccess();
    const respuestas = await Promise.all([api.GET('/api/viajes/'), api.GET('/api/viajes/'), api.GET('/api/viajes/')]);
    expect(respuestas.map((r) => r.response.status)).toEqual([200, 200, 200]);
    expect(servidor.cuenta(REFRESH)).toBe(1);
    expect(servidor.cuenta(VIAJES)).toBe(6);
  });

  it.each([
    ['con Web Locks', crearLocks(), 1],
    ['sin Web Locks (un reintento del plan B)', null, 2],
  ])('si la renovación falla (%s), limpia la sesión sin bucles', async (_, locks, refreshEsperados) => {
    const { api, servidor, sesion, reloj } = await preparar({ locks });
    servidor.vencerAccess();
    servidor.expirarSesion();
    const peticion = api.GET('/api/viajes/');
    await vaciar();
    if (!locks) reloj.avanzar();
    const { response } = await peticion;
    expect(response.status).toBe(401);
    expect(servidor.cuenta(REFRESH)).toBe(refreshEsperados);
    expect(sesion.estado()).toEqual({ fase: 'anonima', aviso: MENSAJES.sesion_terminada });
    // Ya anónima: otra petición no intenta renovar.
    await api.GET('/api/viajes/');
    expect(servidor.cuenta(REFRESH)).toBe(refreshEsperados);
  });

  it('sesion_invalida y sesion_expirada terminan igual', async () => {
    const expirada = await preparar();
    expirada.servidor.vencerAccess();
    expirada.servidor.expirarSesion();
    await expirada.api.GET('/api/viajes/');

    const invalida = await preparar();
    invalida.servidor.vencerAccess();
    invalida.servidor.frasco.refresh = 'R-desconocido';
    await invalida.api.GET('/api/viajes/');

    expect(expirada.sesion.estado()).toEqual(invalida.sesion.estado());
    expect(invalida.sesion.estado()).toEqual({ fase: 'anonima', aviso: MENSAJES.sesion_terminada });
  });

  it('si la renovación falla por red mantiene la sesión y devuelve el 401', async () => {
    const { api, servidor, sesion, entorno } = await preparar();
    servidor.vencerAccess();
    const fetchDelServidor = entorno.fetch;
    entorno.fetch = (entrada, init) => {
      const url = entrada instanceof Request ? entrada.url : entrada;
      if (url.endsWith('/api/auth/refresh/')) return Promise.reject(new TypeError('Failed to fetch'));
      return fetchDelServidor(entrada, init);
    };
    const { response } = await api.GET('/api/viajes/');
    expect(response.status).toBe(401);
    expect(sesion.estado().fase).toBe('autenticada');
  });

  it('origen_no_permitido en la renovación cierra la sesión con su mensaje', async () => {
    const { api, servidor, sesion } = await preparar();
    servidor.vencerAccess();
    servidor.rechazarOrigen = true;
    await api.GET('/api/viajes/');
    expect(sesion.estado()).toEqual({ fase: 'anonima', aviso: MENSAJES.origen_no_permitido });
  });

  it('las rutas de /api/auth/ no se reintentan', async () => {
    const { api, servidor } = await preparar();
    servidor.vencerAccess();
    const { response } = await api.GET('/api/auth/yo/');
    expect(response.status).toBe(401);
    expect(servidor.cuenta(REFRESH)).toBe(0);
  });
});
