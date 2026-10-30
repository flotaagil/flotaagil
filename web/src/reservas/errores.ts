/**
 * Errores de /api/viajes/ para la interfaz.
 *
 * Un 400 trae el formato de DRF (no está en el OpenAPI): `{campo: [mensajes]}`, anidado en `pasajero` y
 * `vuelo`, más `non_field_errors` o `detail`. Los mensajes llegan en español y se muestran tal cual en su
 * campo. Lo que no corresponde a un campo del formulario va a un aviso general.
 */

import { MENSAJES } from '../api/errores';
import { ErrorApi } from './api';

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

export interface ErroresFormulario {
  campos: Record<string, string>;
  generales: string[];
}

function textos(valor: unknown): string[] | null {
  if (typeof valor === 'string') return [valor];
  if (Array.isArray(valor) && valor.every((v) => typeof v === 'string')) return valor as string[];
  return null;
}

/** Aplana el cuerpo de un 400. `permitidos`: campos que el formulario muestra (el resto, a generales). */
export function erroresDelBackend(cuerpo: unknown, permitidos: readonly string[]): ErroresFormulario {
  const resultado: ErroresFormulario = { campos: {}, generales: [] };
  function recorrer(valor: unknown, ruta: string) {
    const lista = textos(valor);
    if (lista) {
      const campo = CAMPOS[ruta];
      if (campo && permitidos.includes(campo) && !resultado.campos[campo]) resultado.campos[campo] = lista.join(' ');
      else resultado.generales.push(...lista);
      return;
    }
    if (valor && typeof valor === 'object') {
      for (const [clave, interno] of Object.entries(valor)) {
        const general = clave === 'non_field_errors' || clave === 'detail';
        recorrer(interno, general ? `${ruta}#general` : ruta ? `${ruta}.${clave}` : clave);
      }
    }
  }
  recorrer(cuerpo, '');
  if (!Object.keys(resultado.campos).length && !resultado.generales.length) {
    resultado.generales.push(MENSAJES.inesperado);
  }
  return resultado;
}

/** Texto del `detail` de un error, si vino. */
export function detalleDe(error: unknown): string | null {
  if (error instanceof ErrorApi && error.cuerpo && typeof error.cuerpo === 'object' && 'detail' in error.cuerpo) {
    const { detail } = error.cuerpo;
    return typeof detail === 'string' ? detail : null;
  }
  return null;
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

/** Al crear, una falla sin respuesta no dice si la reserva quedó creada (el POST no es idempotente). */
export function sinRespuesta(error: unknown): boolean {
  return error instanceof ErrorApi && [0, 502, 503, 504].includes(error.estado);
}
