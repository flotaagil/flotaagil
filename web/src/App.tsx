import { RouterProvider, type createBrowserRouter, type RouteObject } from 'react-router';
import type { Entorno } from './entorno';
import { EntornoContexto } from './entornoContexto';
import { RutasContexto } from './rutas/contexto';

type Router = ReturnType<typeof createBrowserRouter>;

/**
 * Raíz de la aplicación. La sesión no está aquí: la monta la raíz de sesión (lazy) solo en /login y en el
 * panel, así el portal público (/solicitar) no la carga ni hace el refresh silencioso.
 */
export function App({ entorno, rutas, router }: { entorno: Entorno; rutas: RouteObject[]; router: Router }) {
  return (
    <EntornoContexto.Provider value={entorno}>
      <RutasContexto.Provider value={rutas}>
        <RouterProvider router={router} />
      </RutasContexto.Provider>
    </EntornoContexto.Provider>
  );
}
