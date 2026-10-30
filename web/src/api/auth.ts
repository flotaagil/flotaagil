/**
 * Llamadas a /api/auth/ del panel. Van siempre en JSON (el backend rechaza formularios con 415) y con la
 * cookie del refresh, que el navegador envía sola por ser del mismo origen. No pasan por el middleware de
 * reintento del cliente de la API: un 401 aquí es la respuesta, no un access vencido.
 */

import type { Entorno } from '../entorno';
import type { components } from './esquema';

export type Usuario = components['schemas']['UsuarioSesion'];
export type Rol = components['schemas']['RolEnum'];
type SesionPanel = components['schemas']['SesionPanel'];
type Access = components['schemas']['Access'];

const CABECERAS_JSON = { 'Content-Type': 'application/json', Accept: 'application/json' };

function postJson(e: Entorno, ruta: string, cuerpo: unknown = {}): Promise<Response> {
  return e.fetch(`${e.origen}${ruta}`, {
    method: 'POST',
    headers: CABECERAS_JSON,
    body: JSON.stringify(cuerpo),
    credentials: 'same-origin',
  });
}

export const auth = {
  login: (e: Entorno, email: string, password: string) =>
    postJson(e, '/api/auth/token/', { email, password }),
  refresh: (e: Entorno) => postJson(e, '/api/auth/refresh/'),
  logout: (e: Entorno) => postJson(e, '/api/auth/logout/'),
  yo: (e: Entorno, access: string) =>
    e.fetch(`${e.origen}/api/auth/yo/`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${access}` },
      credentials: 'same-origin',
    }),
};

export async function leerSesion(respuesta: Response): Promise<SesionPanel> {
  return (await respuesta.json()) as SesionPanel;
}

export async function leerAccess(respuesta: Response): Promise<string> {
  return ((await respuesta.json()) as Access).access;
}

export async function leerUsuario(respuesta: Response): Promise<Usuario> {
  return (await respuesta.json()) as Usuario;
}
