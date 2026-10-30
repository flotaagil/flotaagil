import type { Entorno } from '../entorno';
import { crearSesion, type Sesion } from '../sesion/sesion';

/** Sesión con el canal entre pestañas y el oyente de `online` activos, como la monta SesionProvider. */
export function crearSesionConectada(entorno: Entorno): Sesion {
  const sesion = crearSesion(entorno);
  sesion.conectar();
  return sesion;
}
