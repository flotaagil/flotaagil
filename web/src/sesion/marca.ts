import type { Almacen } from './entorno';

export const CLAVE_LOGOUT_PENDIENTE = 'flotaagil.logout_pendiente';

export interface Marca {
  existe(): boolean;
  poner(): void;
  borrar(): void;
}

/**
 * Marca «logout_pendiente»: el servidor no confirmó el logout. Mientras exista, ninguna pestaña renueva la
 * sesión y se reintenta el logout.
 *
 * Vive en localStorage para que la vean todas las pestañas y sobreviva a una recarga. Si localStorage no
 * está disponible (o falla), queda en memoria de la pestaña y las demás la reciben por BroadcastChannel:
 * en ese caso no sobrevive a una recarga (documentado en web/README.md).
 */
export function crearMarca(almacen: Almacen | null): Marca {
  let enMemoria = false;
  return {
    existe() {
      if (almacen) {
        try {
          return almacen.getItem(CLAVE_LOGOUT_PENDIENTE) !== null;
        } catch {
          // localStorage dejó de responder: queda lo que sepa esta pestaña.
        }
      }
      return enMemoria;
    },
    poner() {
      enMemoria = true;
      try {
        almacen?.setItem(CLAVE_LOGOUT_PENDIENTE, new Date().toISOString());
      } catch {
        // Sin almacenamiento: la marca queda solo en memoria.
      }
    },
    borrar() {
      enMemoria = false;
      try {
        almacen?.removeItem(CLAVE_LOGOUT_PENDIENTE);
      } catch {
        // Nada que borrar si el almacenamiento no responde.
      }
    },
  };
}
