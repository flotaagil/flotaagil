/**
 * Tabla única de rutas. De aquí salen el router, la guarda por rol, el menú y la validación de `volver`.
 *
 * La guarda por rol es solo UX: la seguridad la pone el backend (401/403 y aislamiento por empresa).
 */

import type { RouteObject } from 'react-router';
import type { Rol } from '../api/auth';
import { Layout } from '../componentes/Layout';
import { Inicio } from '../paginas/Inicio';
import { Login } from '../paginas/Login';
import { NoEncontrada } from '../paginas/NoEncontrada';
import { RutaAutenticada } from './RutaAutenticada';

export interface Manejo {
  titulo: string;
  /** Aparece en el menú. */
  menu?: boolean;
  /** Roles que pueden verla; sin roles, cualquiera con sesión del panel. */
  roles?: Rol[];
}

export const ROLES_PANEL: Rol[] = ['ADMINISTRADOR', 'DESPACHADOR'];

/** Pantallas del panel (con sesión). Las nuevas se agregan aquí. */
export const pantallasDelPanel: RouteObject[] = [
  { index: true, element: <Inicio />, handle: { titulo: 'Inicio', menu: true, roles: ROLES_PANEL } satisfies Manejo },
];

export function crearRutas(pantallas: RouteObject[] = pantallasDelPanel): RouteObject[] {
  return [
    { path: '/login', element: <Login /> },
    {
      element: <RutaAutenticada />,
      children: [{ path: '/', element: <Layout />, children: pantallas }],
    },
    { path: '*', element: <NoEncontrada /> },
  ];
}

export interface EntradaMenu {
  ruta: string;
  titulo: string;
}

/** Menú generado desde la tabla, filtrado por rol: solo muestra pantallas que existen. */
export function entradasDeMenu(rutas: RouteObject[], rol: Rol, base = ''): EntradaMenu[] {
  return rutas.flatMap((ruta) => {
    const camino = ruta.path ? `${base.replace(/\/$/, '')}/${ruta.path.replace(/^\//, '')}` : base || '/';
    const manejo = ruta.handle as Manejo | undefined;
    const propia =
      manejo?.menu && (!manejo.roles || manejo.roles.includes(rol)) ? [{ ruta: camino, titulo: manejo.titulo }] : [];
    return [...propia, ...entradasDeMenu(ruta.children ?? [], rol, camino)];
  });
}
