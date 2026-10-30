import { Navigate, Outlet, useLocation } from 'react-router';
import { Cargando } from '../componentes/Cargando';
import { SinConexion } from '../componentes/SinConexion';
import { useIniciarSesion, useSesion } from '../sesion/SesionProvider';

/**
 * Rutas del panel: hace el refresh silencioso y, sin sesión, lleva a /login con `volver`. Si el servidor no
 * responde, muestra «sin conexión» con Reintentar (la URL se conserva).
 */
export function RutaAutenticada() {
  const estado = useIniciarSesion();
  const { sesion } = useSesion();
  const ubicacion = useLocation();
  if (estado.fase === 'inicial' || estado.fase === 'cargando') return <Cargando />;
  if (estado.fase === 'sin_conexion') {
    return <SinConexion motivo={estado.motivo} alReintentar={() => void sesion.reintentar()} />;
  }
  if (estado.fase === 'anonima') {
    const volver = `${ubicacion.pathname}${ubicacion.search}${ubicacion.hash}`;
    const destino = volver === '/' ? '/login' : `/login?volver=${encodeURIComponent(volver)}`;
    return <Navigate to={destino} replace />;
  }
  return <Outlet />;
}
