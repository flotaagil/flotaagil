/**
 * Llamadas del portal público (HU-19): /api/portal/{slug}/ y /api/portal/{slug}/solicitudes/.
 *
 * Sin sesión: cliente openapi-fetch propio, sin el middleware de access y renovación del panel. Las rutas
 * del portal no cargan nada de src/sesion/ (lo verifica scripts/verificar-carga.mjs).
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import createClient, { type Client } from 'openapi-fetch';
import type { Entorno } from '../entorno';
import type { components, paths } from '../api/esquema';
import { resultado } from '../api/resultado';

export type EmpresaPublica = components['schemas']['EmpresaPublica'];
export type Solicitud = components['schemas']['SolicitudRequest'];
export type SolicitudRespuesta = components['schemas']['SolicitudRespuesta'];
export type Sentido = components['schemas']['SentidoEnum'];
export type ClientePortal = Client<paths>;

export function crearClientePortal(e: Entorno): ClientePortal {
  return createClient<paths>({ baseUrl: e.origen, fetch: (peticion: Request) => e.fetch(peticion) });
}

export const claves = {
  empresa: (slug: string) => ['portal', 'empresa', slug] as const,
};

export function useEmpresa(api: ClientePortal, slug: string) {
  return useQuery({
    queryKey: claves.empresa(slug),
    queryFn: () => resultado(api.GET('/api/portal/{slug}/', { params: { path: { slug } } })),
    // Sin reintentos automáticos: un 404 es la respuesta y una falla de red se reintenta con el botón.
    staleTime: 5 * 60_000,
  });
}

export function useSolicitar(api: ClientePortal, slug: string) {
  return useMutation({
    mutationFn: (solicitud: Solicitud) =>
      resultado(api.POST('/api/portal/{slug}/solicitudes/', { params: { path: { slug } }, body: solicitud })),
  });
}
