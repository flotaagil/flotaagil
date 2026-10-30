/**
 * Tabla única de rutas. De aquí salen el router, la guarda por rol, el menú y la validación de `volver`.
 *
 * La guarda por rol es solo UX: la seguridad la pone el backend (401/403 y aislamiento por empresa).
 *
 * Todas las pantallas se cargan con `lazy`: el paquete inicial lleva solo el router, la sesión y el marco.
 * El `handle` (título, menú, roles) queda aquí, estático, para que el menú y la guarda no carguen código de
 * las pantallas. Ninguna ruta pública debe importar módulos de src/reservas/ (lo verifica
 * scripts/verificar-carga.mjs al final del build).
 */

import type { RouteObject } from 'react-router';
import type { Rol } from '../api/auth';
import { Cargando } from '../componentes/Cargando';
import { ErrorDeRuta } from '../componentes/ErrorDeRuta';
import { Layout } from '../componentes/Layout';
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
  {
    index: true,
    lazy: async () => ({ Component: (await import('../paginas/Inicio')).Inicio }),
    handle: { titulo: 'Inicio', menu: true, roles: ROLES_PANEL } satisfies Manejo,
  },
  {
    path: 'reservas',
    handle: { titulo: 'Reservas', menu: true, roles: ROLES_PANEL } satisfies Manejo,
    children: [
      { index: true, lazy: async () => ({ Component: (await import('../reservas/paginas/Listado')).Listado }) },
      {
        path: 'nueva',
        lazy: async () => ({ Component: (await import('../reservas/paginas/Nueva')).Nueva }),
        handle: { titulo: 'Nueva reserva', roles: ROLES_PANEL } satisfies Manejo,
      },
      {
        path: ':id',
        lazy: async () => ({ Component: (await import('../reservas/paginas/Detalle')).Detalle }),
        handle: { titulo: 'Reserva', roles: ROLES_PANEL } satisfies Manejo,
      },
      {
        path: ':id/editar',
        lazy: async () => ({ Component: (await import('../reservas/paginas/Editar')).Editar }),
        handle: { titulo: 'Editar reserva', roles: ROLES_PANEL } satisfies Manejo,
      },
    ],
  },
];

export function crearRutas(pantallas: RouteObject[] = pantallasDelPanel): RouteObject[] {
  const comunes = { hydrateFallbackElement: <Cargando />, errorElement: <ErrorDeRuta /> };
  return [
    {
      path: '/login',
      lazy: async () => ({ Component: (await import('../paginas/Login')).Login }),
      ...comunes,
    },
    {
      element: <RutaAutenticada />,
      ...comunes,
      children: [{ path: '/', element: <Layout />, children: pantallas }],
    },
    {
      path: '*',
      lazy: async () => ({ Component: (await import('../paginas/NoEncontrada')).NoEncontrada }),
      ...comunes,
    },
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
