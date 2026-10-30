import { Outlet } from 'react-router';
import { useEntorno } from '../entornoContexto';
import { SesionProvider } from './SesionProvider';

/**
 * Raíz de las rutas con sesión (/login y el panel), cargada con lazy. Mientras se navega entre ellas el
 * proveedor no se desmonta y la sesión se conserva; fuera de ellas (portal, página no encontrada) no existe.
 */
export function RaizSesion() {
  return (
    <SesionProvider entorno={useEntorno()}>
      <Outlet />
    </SesionProvider>
  );
}
