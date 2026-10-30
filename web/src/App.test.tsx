import { act, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { MENSAJES } from './api/errores';
import { crearAlmacen, crearBus, crearEntorno, crearLocks, vaciar } from './pruebas/entornoFalso';
import { ServidorAuthFalso } from './pruebas/servidorAuthFalso';
import { crearRutas, pantallasDelPanel, ROLES_PANEL, type Manejo } from './rutas/tabla';
import { useApi } from './sesion/SesionProvider';

function BotonConsultar() {
  const api = useApi();
  return (
    <button type="button" onClick={() => void api.GET('/api/viajes/')}>
      Consultar viajes
    </button>
  );
}

const pantallasDePrueba: RouteObject[] = [
  ...pantallasDelPanel,
  {
    path: 'solo-admin',
    element: <p>Contenido de administración</p>,
    handle: { titulo: 'Solo admin', menu: true, roles: ['ADMINISTRADOR'] } satisfies Manejo,
  },
  {
    path: 'consultar',
    element: <BotonConsultar />,
    handle: { titulo: 'Consultar', roles: ROLES_PANEL } satisfies Manejo,
  },
];

function montar(ruta: string, { servidor = new ServidorAuthFalso(), pantallas = pantallasDelPanel } = {}) {
  const { entorno } = crearEntorno({ servidor, locks: crearLocks() });
  const rutas = crearRutas(pantallas);
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(<App entorno={entorno} rutas={rutas} router={router} />);
  return { servidor, router, entorno };
}

async function ingresar(email: string, password = 'clave') {
  const usuario = userEvent.setup();
  await usuario.type(await screen.findByLabelText('Correo'), email);
  await usuario.type(screen.getByLabelText('Contraseña'), password);
  await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
  return usuario;
}

describe('arranque', () => {
  it('no muestra el login mientras hace el refresh silencioso; con sesión entra directo', async () => {
    const servidor = new ServidorAuthFalso();
    servidor.sembrarSesion('admin@andes.example');
    servidor.retener('POST /api/auth/refresh/');
    montar('/', { servidor });
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
    expect(screen.queryByLabelText('Correo')).not.toBeInTheDocument();
    // La pantalla se carga con lazy: el refresh sale cuando llega su chunk.
    await waitFor(() => expect(servidor.pendientes).toHaveLength(1));
    expect(screen.queryByLabelText('Correo')).not.toBeInTheDocument();
    await act(async () => {
      servidor.entregar();
      await vaciar();
    });
    expect(await screen.findByText('Hola, Ana Admin.')).toBeInTheDocument();
  });

  it('sin sesión lleva al login', async () => {
    const { router } = montar('/');
    expect(await screen.findByLabelText('Correo')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('una ruta protegida sin sesión guarda `volver`', async () => {
    const { router } = montar('/consultar?x=1', { pantallas: pantallasDePrueba });
    await screen.findByLabelText('Correo');
    expect(router.state.location.search).toBe(`?volver=${encodeURIComponent('/consultar?x=1')}`);
  });

  it('en /login con sesión vigente pasa al destino', async () => {
    const servidor = new ServidorAuthFalso();
    servidor.sembrarSesion();
    const { router } = montar('/login', { servidor });
    expect(await screen.findByText('Hola, Diego Despacho.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('las rutas públicas no hacen refresh silencioso', async () => {
    const servidor = new ServidorAuthFalso();
    servidor.sembrarSesion();
    montar('/no/existe', { servidor });
    expect(await screen.findByText('Página no encontrada')).toBeInTheDocument();
    await act(() => vaciar());
    expect(servidor.cuenta('POST /api/auth/refresh/')).toBe(0);
  });
});

describe('login', () => {
  it('valida el formulario antes de enviarlo', async () => {
    const { servidor } = montar('/login');
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Ingresa un correo válido.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa tu contraseña.')).toBeInTheDocument();
    expect(servidor.cuenta('POST /api/auth/token/')).toBe(0);
  });

  it.each([
    ['despacho@andes.example', 'mala', MENSAJES.credenciales_invalidas],
    ['conductor@andes.example', 'clave', MENSAJES.rol_no_permitido],
    ['bloqueada@andes.example', 'clave', MENSAJES.cuenta_bloqueada],
  ])('%s: muestra el error del código', async (email, password, mensaje) => {
    montar('/login');
    await ingresar(email, password);
    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje);
  });

  it('entra y vuelve a la ruta pedida', async () => {
    const { router } = montar(`/login?volver=${encodeURIComponent('/consultar?x=1#y')}`, {
      pantallas: pantallasDePrueba,
    });
    await ingresar('despacho@andes.example');
    expect(await screen.findByRole('button', { name: 'Consultar viajes' })).toBeInTheDocument();
    expect(router.state.location).toMatchObject({ pathname: '/consultar', search: '?x=1', hash: '#y' });
  });

  it('un `volver` externo lleva a Inicio', async () => {
    const { router } = montar(`/login?volver=${encodeURIComponent('//evil.example')}`);
    await ingresar('despacho@andes.example');
    expect(await screen.findByText('Hola, Diego Despacho.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('guardas y menú', () => {
  it('el menú solo muestra las pantallas del rol', async () => {
    montar('/login', { pantallas: pantallasDePrueba });
    await ingresar('despacho@andes.example');
    const menu = await screen.findByRole('navigation', { name: 'Menú principal' });
    expect(menu).toHaveTextContent('Inicio');
    expect(menu).not.toHaveTextContent('Solo admin');
    expect(menu).not.toHaveTextContent('Consultar'); // existe, pero no va en el menú
  });

  it('un rol sin permiso ve «Sin permiso» (la seguridad real la pone el backend)', async () => {
    montar('/login?volver=%2Fsolo-admin', { pantallas: pantallasDePrueba });
    await ingresar('despacho@andes.example');
    expect(await screen.findByText('Tu rol no tiene acceso a esta pantalla.')).toBeInTheDocument();
    expect(screen.queryByText('Contenido de administración')).not.toBeInTheDocument();
  });

  it('el administrador ve la pantalla y su entrada en el menú', async () => {
    montar('/login?volver=%2Fsolo-admin', { pantallas: pantallasDePrueba });
    await ingresar('admin@andes.example');
    expect(await screen.findByText('Contenido de administración')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Menú principal' })).toHaveTextContent('Solo admin');
  });
});

describe('fin de la sesión', () => {
  it('si la renovación falla vuelve al login con «Tu sesión terminó»', async () => {
    const servidor = new ServidorAuthFalso();
    servidor.sembrarSesion();
    const { router } = montar('/consultar', { servidor, pantallas: pantallasDePrueba });
    const usuario = userEvent.setup();
    const boton = await screen.findByRole('button', { name: 'Consultar viajes' });
    servidor.vencerAccess();
    servidor.expirarSesion();
    await usuario.click(boton);
    expect(await screen.findByText(MENSAJES.sesion_terminada)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('cerrar sesión confirmado vuelve al login sin aviso', async () => {
    const { servidor } = montar('/login');
    const usuario = await ingresar('despacho@andes.example');
    await usuario.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByLabelText('Correo')).toBeInTheDocument();
    expect(screen.queryByText(MENSAJES.logout_no_confirmado)).not.toBeInTheDocument();
    expect(servidor.frasco.refresh).toBeNull();
  });

  it('cerrar sesión sin conexión avisa que no se pudo confirmar', async () => {
    const { servidor } = montar('/login');
    const usuario = await ingresar('despacho@andes.example');
    servidor.enLinea = false;
    await usuario.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByText(MENSAJES.logout_no_confirmado)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Correo')).toBeInTheDocument());
  });
});

describe('dos pestañas en React StrictMode', () => {
  it('el logout en una cierra la otra (el canal sobrevive al doble montaje)', async () => {
    const servidor = new ServidorAuthFalso();
    servidor.sembrarSesion();
    const bus = crearBus();
    const almacen = crearAlmacen();
    const locks = crearLocks();
    const rutas = crearRutas();
    const pestanas = [0, 1].map(() => {
      const { entorno } = crearEntorno({ servidor, bus, almacen, locks });
      const contenedor = document.createElement('div');
      document.body.append(contenedor);
      const router = createMemoryRouter(rutas, { initialEntries: ['/'] });
      render(
        <StrictMode>
          <App entorno={entorno} rutas={rutas} router={router} />
        </StrictMode>,
        { container: contenedor },
      );
      return { contenedor, router };
    });
    const [uno, dos] = pestanas.map(({ contenedor }) => within(contenedor));
    expect(await uno.findByText('Hola, Diego Despacho.')).toBeInTheDocument();
    expect(await dos.findByText('Hola, Diego Despacho.')).toBeInTheDocument();
    await userEvent.setup().click(uno.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await dos.findByLabelText('Correo')).toBeInTheDocument();
    expect(pestanas[1].router.state.location.pathname).toBe('/login');
  });
});

describe('error al cargar una pantalla', () => {
  it.each([
    [new TypeError('Failed to fetch dynamically imported module: /assets/Listado-x.js'), 'Hay una versión nueva del panel'],
    [new Error('Fallo cualquiera'), 'Ocurrió un error inesperado'],
  ])('%s → «%s» con Recargar', async (error, titulo) => {
    const servidor = new ServidorAuthFalso();
    servidor.sembrarSesion();
    const pantallas: RouteObject[] = [
      ...pantallasDelPanel,
      {
        path: 'rota',
        lazy: async () => {
          throw error;
        },
      },
    ];
    montar('/rota', { servidor, pantallas });
    expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument();
  });
});
