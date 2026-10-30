/** Textos para los valores de la API (los mismos del backend, en español). */

import type { components } from '../api/esquema';
import type { Canal, EstadoViaje, Sentido } from './api';

export const ESTADOS: Record<EstadoViaje, string> = {
  PENDIENTE_CONFIRMACION: 'Pendiente de confirmación',
  SOLICITADO: 'Solicitado',
  ASIGNADO: 'Asignado',
  ACEPTADO: 'Aceptado',
  EN_CAMINO: 'En camino',
  EN_ZONA: 'En zona',
  PASAJERO_A_BORDO: 'Pasajero a bordo',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
};

/** Orden del ciclo de vida, para listas y filtros. */
export const ORDEN_ESTADOS = Object.keys(ESTADOS) as EstadoViaje[];

/** Grupo visual de cada estado (la etiqueta lleva texto además del color). */
export const GRUPO_ESTADO: Record<EstadoViaje, 'pendiente' | 'curso' | 'fin' | 'cancelado'> = {
  PENDIENTE_CONFIRMACION: 'pendiente',
  SOLICITADO: 'pendiente',
  ASIGNADO: 'curso',
  ACEPTADO: 'curso',
  EN_CAMINO: 'curso',
  EN_ZONA: 'curso',
  PASAJERO_A_BORDO: 'curso',
  FINALIZADO: 'fin',
  CANCELADO: 'cancelado',
};

export const SENTIDOS: Record<Sentido, string> = {
  URBANO: 'Urbano',
  HACIA_AEROPUERTO: 'Hacia el aeropuerto',
  DESDE_AEROPUERTO: 'Desde el aeropuerto',
};

export const CANALES: Record<Canal, string> = {
  TELEFONO: 'Teléfono',
  WHATSAPP: 'WhatsApp',
  WEB: 'Portal web',
  CONVENIO: 'Convenio',
};

export const ACTORES: Record<components['schemas']['ActorEnum'], string> = {
  CONDUCTOR: 'Conductor',
  DESPACHADOR: 'Despachador',
  ADMINISTRADOR: 'Administrador',
  PASAJERO: 'Pasajero',
  SISTEMA: 'Sistema',
};

export const ORIGENES_CANCELACION: Record<components['schemas']['OrigenCancelacionEnum'], string> = {
  PASAJERO: 'Pasajero',
  DESPACHADOR: 'Despachador',
  ADMINISTRADOR: 'Administrador',
  SUPERVISOR: 'Supervisor de convenio',
  SISTEMA: 'Sistema',
};

export const ESTADOS_VUELO: Record<components['schemas']['EstadoVueloEnum'], string> = {
  PROGRAMADO: 'Programado',
  DEMORADO: 'Demorado',
  ATERRIZADO: 'Aterrizado',
  CANCELADO: 'Cancelado',
  DESVIADO: 'Desviado',
};

export const ORDENES = {
  recogida_en: 'Recogida (más antigua primero)',
  '-recogida_en': 'Recogida (más reciente primero)',
  '-creado_en': 'Ingreso (más reciente primero)',
  creado_en: 'Ingreso (más antiguo primero)',
} as const;

export type Orden = keyof typeof ORDENES;
