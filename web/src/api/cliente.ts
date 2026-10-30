/**
 * Cliente tipado de la API (openapi-fetch + tipos generados desde backend/openapi.yaml).
 *
 * Agrega el access de la sesión y, ante un 401, renueva con la operación compartida de la pestaña y repite
 * la petición UNA vez. El reintento se hace fuera del middleware, así que un segundo 401 no vuelve a
 * renovar. Las rutas /api/auth/ no se reintentan: su 401 es la respuesta.
 */

import createClient, { type Client } from 'openapi-fetch';
import type { Entorno } from '../entorno';
import type { Sesion } from '../sesion/sesion';
import type { paths } from './esquema';

export type ClienteApi = Client<paths>;

export function crearClienteApi(e: Entorno, sesion: Sesion): ClienteApi {
  const cliente = createClient<paths>({
    baseUrl: e.origen,
    fetch: (peticion: Request) => e.fetch(peticion),
  });
  // Copia intacta (con el cuerpo sin consumir) de cada petición, para poder repetirla.
  const copias = new WeakMap<Request, Request>();

  cliente.use({
    onRequest({ request }) {
      const access = sesion.access();
      if (access) request.headers.set('Authorization', `Bearer ${access}`);
      copias.set(request, request.clone());
      return request;
    },
    async onResponse({ request, response }) {
      if (response.status !== 401 || new URL(request.url).pathname.startsWith('/api/auth/')) {
        return response;
      }
      const copia = copias.get(request);
      const nuevo = copia ? await sesion.renovarTrasRechazo() : null;
      if (!copia || !nuevo) return response;
      const reintento = new Request(copia);
      reintento.headers.set('Authorization', `Bearer ${nuevo}`);
      return e.fetch(reintento);
    },
  });
  return cliente;
}
