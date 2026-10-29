import { Navigate, Outlet, useLocation } from 'react-router';
import { Cargando } from '../componentes/Cargando';
import { useIniciarSesion } from '../sesion/SesionProvider';

/** Rutas del panel: hace el refresh silencioso y, sin sesión, lleva a /login con `volver`. */
export function RutaAutenticada() {
  const estado = useIniciarSesion();
  const ubicacion = useLocation();
  if (estado.fase === 'inicial' || estado.fase === 'cargando') return <Cargando />;
  if (estado.fase === 'anonima') {
    const volver = `${ubicacion.pathname}${ubicacion.search}${ubicacion.hash}`;
    const destino = volver === '/' ? '/login' : `/login?volver=${encodeURIComponent(volver)}`;
    return <Navigate to={destino} replace />;
  }
  return <Outlet />;
}
