import { useState } from 'react';
import { NavLink, Outlet, useMatches, useNavigate } from 'react-router';
import type { Manejo } from '../rutas/tabla';
import { entradasDeMenu } from '../rutas/tabla';
import { useRutas } from '../rutas/contexto';
import { SinPermiso } from '../paginas/SinPermiso';
import { useSesion } from '../sesion/SesionProvider';
import estilos from './Layout.module.css';

const NOMBRE_ROL = { ADMINISTRADOR: 'Administrador', DESPACHADOR: 'Despachador', CONDUCTOR: 'Conductor' };

/** Marco del panel: cabecera, menú por rol y guarda por rol (solo UX: el backend responde 403 igual). */
export function Layout() {
  const { sesion, estado } = useSesion();
  const rutas = useRutas();
  const coincidencias = useMatches();
  const navegar = useNavigate();
  const [menuAbierto, setMenuAbierto] = useState(false);
  if (estado.fase !== 'autenticada') return null;
  const { usuario } = estado;

  const roles = coincidencias
    .map((c) => (c.handle as Manejo | undefined)?.roles)
    .filter((r) => r !== undefined)
    .at(-1);
  const permitido = !roles || roles.includes(usuario.rol);
  const menu = entradasDeMenu(rutas, usuario.rol);

  async function cerrarSesion() {
    await sesion.logout();
    navegar('/login', { replace: true });
  }

  return (
    <div className={estilos.marco}>
      <header className={estilos.cabecera}>
        <button
          type="button"
          className={estilos.botonMenu}
          aria-expanded={menuAbierto}
          aria-controls="menu-principal"
          onClick={() => setMenuAbierto((abierto) => !abierto)}
        >
          Menú
        </button>
        <span className={estilos.marca}>FlotaÁgil</span>
        <span className={estilos.empresa}>{usuario.empresa.razon_social}</span>
        <div className={estilos.usuario}>
          <span>
            {usuario.nombre} · {NOMBRE_ROL[usuario.rol]}
          </span>
          <button type="button" className={estilos.salir} onClick={() => void cerrarSesion()}>
            Cerrar sesión
          </button>
        </div>
      </header>
      <nav id="menu-principal" className={estilos.menu} data-abierto={menuAbierto} aria-label="Menú principal">
        <ul>
          {menu.map((entrada) => (
            <li key={entrada.ruta}>
              {/* Inicio solo se marca en «/»; Reservas también en /reservas/42. */}
              <NavLink to={entrada.ruta} end={entrada.ruta === '/'} onClick={() => setMenuAbierto(false)}>
                {entrada.titulo}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className={estilos.contenido}>{permitido ? <Outlet /> : <SinPermiso />}</main>
    </div>
  );
}
