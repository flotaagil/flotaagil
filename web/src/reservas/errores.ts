/**
 * Errores de /api/viajes/ para la interfaz.
 *
 * Un 400 trae el formato de DRF (no está en el OpenAPI): `{campo: [mensajes]}`, anidado en `pasajero` y
 * `vuelo`, más `non_field_errors` o `detail`. Los mensajes llegan en español y se muestran tal cual en su
 * campo. Lo que no corresponde a un campo del formulario va a un aviso general.
 */

import { MENSAJES } from '../api/errores';
import { erroresDelBackend as erroresDrf, type ErroresFormulario } from '../api/erroresDrf';
import { detalleDe, ErrorApi } from '../api/resultado';

export { sinRespuesta } from '../api/resultado';

/** Ruta del campo en la API → ruta del campo en el formulario. */
const CAMPOS: Record<string, string> = {
  'pasajero.nombre': 'pasajero.nombre',
  'pasajero.telefono': 'pasajero.telefono',
  canal: 'canal',
  sentido: 'sentido',
  origen_dir: 'origen_dir',
  destino_dir: 'destino_dir',
  recogida_en: 'recogida',
  vuelo: 'vuelo.numero',
  'vuelo.numero': 'vuelo.numero',
  'vuelo.hora_programada': 'vuelo.hora',
};

/** Aplana el cuerpo de un 400 de /api/viajes/. `permitidos`: campos que muestra el formulario. */
export function erroresDelBackend(cuerpo: unknown, permitidos: readonly string[]): ErroresFormulario {
  return erroresDrf(cuerpo, CAMPOS, permitidos);
}

/** Mensaje para un error de consulta o de una acción. */
export function mensajeDeErrorApi(error: unknown): string {
  if (!(error instanceof ErrorApi)) return MENSAJES.inesperado;
  const { estado } = error;
  if (estado === 0 || estado === 502 || estado === 503 || estado === 504) return MENSAJES.sin_conexion;
  if (estado === 404) return 'No se encontró la reserva.';
  if (estado === 403) return 'Tu rol no tiene acceso a esta acción.';
  if (estado === 401) return MENSAJES.sesion_terminada;
  if (estado === 409) return detalleDe(error) ?? 'La reserva no admite la operación en su estado actual.';
  if (estado >= 500) return MENSAJES.error_servidor;
  return detalleDe(error) ?? MENSAJES.inesperado;
}
