import { RouterProvider, type createBrowserRouter, type RouteObject } from 'react-router';
import { RutasContexto } from './rutas/contexto';
import type { Entorno } from './sesion/entorno';
import { SesionProvider } from './sesion/SesionProvider';

type Router = ReturnType<typeof createBrowserRouter>;

export function App({ entorno, rutas, router }: { entorno: Entorno; rutas: RouteObject[]; router: Router }) {
  return (
    <SesionProvider entorno={entorno}>
      <RutasContexto.Provider value={rutas}>
        <RouterProvider router={router} />
      </RutasContexto.Provider>
    </SesionProvider>
  );
}
