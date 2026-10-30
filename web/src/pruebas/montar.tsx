import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { expect } from 'vitest';
import { App } from '../App';
import { crearRutas } from '../rutas/tabla';
import { crearEntorno, crearLocks } from './entornoFalso';
import { ServidorAuthFalso } from './servidorAuthFalso';
import { ServidorViajesFalso } from './servidorViajesFalso';

/** Monta el panel completo en `ruta` con una sesión vigente y el servidor de reservas falso. */
export function montarPanel(ruta: string, { email = 'despacho@andes.example', servidor = new ServidorAuthFalso() } = {}) {
  servidor.sembrarSesion(email);
  const viajes = new ServidorViajesFalso(servidor);
  const { entorno, volverLaConexion } = crearEntorno({ servidor, locks: crearLocks() });
  const rutas = crearRutas();
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  const resultado = render(<App entorno={entorno} rutas={rutas} router={router} />);
  /** Simula F5: desmonta y vuelve a montar en la URL actual (memoria y caché nuevas, misma cookie). */
  function recargar() {
    const { pathname, search, hash } = router.state.location;
    resultado.unmount();
    return montarPanelConServidor(`${pathname}${search}${hash}`, servidor, viajes);
  }
  return { servidor, viajes, router, entorno, volverLaConexion, recargar };
}

function montarPanelConServidor(ruta: string, servidor: ServidorAuthFalso, viajes: ServidorViajesFalso) {
  const { entorno } = crearEntorno({ servidor, locks: crearLocks() });
  const rutas = crearRutas();
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(<App entorno={entorno} rutas={rutas} router={router} />);
  return { servidor, viajes, router };
}

/** Peticiones GET al listado (ruta + query), en orden. */
export function consultasDelListado(servidor: ServidorAuthFalso): string[] {
  return servidor.urls.filter((url) => url.startsWith('GET /api/viajes/?') || url === 'GET /api/viajes/');
}

/** Espera a que la pantalla de reservas haya cargado (sale del esqueleto). */
export async function esperarListado() {
  // Primero la pantalla (llega con lazy), después los datos.
  await screen.findByRole('heading', { name: 'Reservas', level: 1 });
  await waitFor(() => expect(screen.queryByLabelText('Cargando reservas')).not.toBeInTheDocument());
}
