/**
 * Formulario del portal: valores, validación y cuerpo para POST /api/portal/{slug}/solicitudes/.
 *
 * - Horas en hora de Chile (src/hora/): una hora inexistente se rechaza y una repetida usa la ocurrencia
 *   elegida. La recogida debe respetar la anticipación mínima de la empresa (el backend tiene la última
 *   palabra; el reloj del teléfono puede estar mal).
 * - Desde el aeropuerto con vuelo, la recogida es opcional: el backend la calcula como llegada + margen.
 * - Las dos aceptaciones son obligatorias. El campo trampa `sitio_web` se envía siempre (vacío para personas).
 */

import { z } from 'zod';
import { codigoDe, detalleDe, ErrorApi } from '../api/resultado';
import { aIso, formatearFechaHora, instanteDeCampo, type ValorFechaHora } from '../hora/hora';
import type { EmpresaPublica, Sentido, Solicitud } from './api';
import { errorTelefono, normalizarTelefono } from './telefono';

export const SENTIDOS: { valor: Sentido; texto: string }[] = [
  { valor: 'URBANO', texto: 'Dentro de la ciudad' },
  { valor: 'HACIA_AEROPUERTO', texto: 'Hacia el aeropuerto' },
  { valor: 'DESDE_AEROPUERTO', texto: 'Desde el aeropuerto (llego en un vuelo)' },
];

const SIN_HORA: ValorFechaHora = { pared: '', ocurrencia: 'primera' };

export interface ValoresSolicitud {
  nombre: string;
  telefono: string;
  sentido: Sentido;
  origen_dir: string;
  destino_dir: string;
  recogida: ValorFechaHora;
  vuelo: { numero: string; hora: ValorFechaHora };
  acepta_privacidad: boolean;
  acepta_whatsapp: boolean;
  sitio_web: string;
}

export const VALORES_INICIALES: ValoresSolicitud = {
  nombre: '',
  telefono: '',
  sentido: 'URBANO',
  origen_dir: '',
  destino_dir: '',
  recogida: SIN_HORA,
  vuelo: { numero: '', hora: SIN_HORA },
  acepta_privacidad: false,
  acepta_whatsapp: false,
  sitio_web: '',
};

/** Ruta del error en la API → campo del formulario (los 400 de DRF). */
export const CAMPOS_API: Record<string, string> = {
  nombre: 'nombre',
  telefono: 'telefono',
  sentido: 'sentido',
  origen_dir: 'origen_dir',
  destino_dir: 'destino_dir',
  recogida_en: 'recogida',
  vuelo: 'vuelo.numero',
  'vuelo.numero': 'vuelo.numero',
  'vuelo.hora_llegada': 'vuelo.hora',
  acepta_privacidad: 'acepta_privacidad',
  acepta_whatsapp: 'acepta_whatsapp',
};

export function camposVisibles(sentido: Sentido): string[] {
  const base = ['nombre', 'telefono', 'sentido', 'origen_dir', 'destino_dir', 'recogida', 'acepta_privacidad', 'acepta_whatsapp'];
  return sentido === 'DESDE_AEROPUERTO' ? [...base, 'vuelo.numero', 'vuelo.hora'] : base;
}

const VUELO_IATA = /^[A-Z0-9]{2} ?\d{1,4}$/;
const MINUTO = 60_000;

export function normalizarVuelo(numero: string): string {
  return numero.toUpperCase().split(/\s+/).filter(Boolean).join(' ');
}

/** Primer instante válido para la recogida: ahora + anticipación mínima de la empresa. */
export function recogidaMinima(empresa: EmpresaPublica, ahora: number): number {
  return ahora + empresa.anticipacion_minima_min * MINUTO;
}

/** Vuelo completo y válido (número y llegada): con él la recogida es opcional. */
function llegadaDelVuelo(v: ValoresSolicitud): number | null {
  if (v.sentido !== 'DESDE_AEROPUERTO') return null;
  const numero = normalizarVuelo(v.vuelo.numero);
  const llegada = instanteDeCampo(v.vuelo.hora);
  return numero && VUELO_IATA.test(numero) && llegada.ok ? llegada.instante : null;
}

export function esquemaSolicitud(empresa: EmpresaPublica, ahora: () => number) {
  return z
    .object({
      nombre: z.string(),
      telefono: z.string(),
      sentido: z.enum(['URBANO', 'HACIA_AEROPUERTO', 'DESDE_AEROPUERTO']),
      origen_dir: z.string(),
      destino_dir: z.string(),
      recogida: z.object({ pared: z.string(), ocurrencia: z.enum(['primera', 'segunda']) }),
      vuelo: z.object({ numero: z.string(), hora: z.object({ pared: z.string(), ocurrencia: z.enum(['primera', 'segunda']) }) }),
      acepta_privacidad: z.boolean(),
      acepta_whatsapp: z.boolean(),
      sitio_web: z.string(),
    })
    .superRefine((v, ctx) => {
      const error = (ruta: string[], message: string) => ctx.addIssue({ code: 'custom', path: ruta, message });
      const nombre = v.nombre.trim();
      if (!nombre) error(['nombre'], 'Ingresa tu nombre.');
      else if (nombre.length > 80) error(['nombre'], 'Máximo 80 caracteres.');
      const telefono = errorTelefono(v.telefono);
      if (telefono) error(['telefono'], telefono);
      for (const campo of ['origen_dir', 'destino_dir'] as const) {
        const valor = v[campo].trim();
        if (!valor) error([campo], 'Ingresa la dirección.');
        else if (valor.length > 200) error([campo], 'Máximo 200 caracteres.');
      }

      if (v.sentido === 'DESDE_AEROPUERTO') {
        const numero = normalizarVuelo(v.vuelo.numero);
        const conHora = v.vuelo.hora.pared !== '';
        if (numero && !VUELO_IATA.test(numero)) error(['vuelo', 'numero'], 'Número de vuelo, p. ej. LA123 o H2 456.');
        if (!numero && conHora) error(['vuelo', 'numero'], 'Ingresa el número del vuelo.');
        if (numero && !conHora) error(['vuelo', 'hora'], 'Ingresa la hora de llegada del vuelo.');
        if (conHora) {
          const llegada = instanteDeCampo(v.vuelo.hora);
          if (!llegada.ok) error(['vuelo', 'hora'], llegada.mensaje);
        }
      }

      const minimo = recogidaMinima(empresa, ahora());
      const anticipacion = `Pide con al menos ${empresa.anticipacion_minima_min} minutos de anticipación`;
      const llegada = llegadaDelVuelo(v);
      if (!v.recogida.pared) {
        if (llegada === null) error(['recogida'], 'Indica la fecha y hora de recogida.');
        else if (llegada + empresa.margen_nacional_min * MINUTO < minimo) {
          const calculada = formatearFechaHora(aIso(llegada + empresa.margen_nacional_min * MINUTO));
          error(
            ['recogida'],
            `Con la llegada + ${empresa.margen_nacional_min} min la recogida quedaría el ${calculada}. ${anticipacion}: indica una hora de recogida.`,
          );
        }
      } else {
        const recogida = instanteDeCampo(v.recogida);
        if (!recogida.ok) error(['recogida'], recogida.mensaje);
        else if (recogida.instante < minimo) {
          error(['recogida'], `${anticipacion}: desde el ${formatearFechaHora(aIso(minimo))} (hora de Chile).`);
        }
      }

      if (!v.acepta_privacidad) error(['acepta_privacidad'], 'Debes aceptar el aviso de privacidad.');
      if (!v.acepta_whatsapp) error(['acepta_whatsapp'], 'Debes aceptar los avisos por WhatsApp para confirmar tu viaje.');
    });
}

function instante(valor: ValorFechaHora): string {
  const resultado = instanteDeCampo(valor);
  if (!resultado.ok) throw new Error(resultado.mensaje); // ya validado por el esquema
  return aIso(resultado.instante);
}

export function cuerpoSolicitud(v: ValoresSolicitud): Solicitud {
  const cuerpo: Solicitud = {
    nombre: v.nombre.trim(),
    telefono: normalizarTelefono(v.telefono),
    sentido: v.sentido,
    origen_dir: v.origen_dir.trim(),
    destino_dir: v.destino_dir.trim(),
    acepta_privacidad: v.acepta_privacidad,
    acepta_whatsapp: v.acepta_whatsapp,
    sitio_web: v.sitio_web,
  };
  if (v.recogida.pared) cuerpo.recogida_en = instante(v.recogida);
  const numero = normalizarVuelo(v.vuelo.numero);
  if (v.sentido === 'DESDE_AEROPUERTO' && numero) {
    cuerpo.vuelo = { numero, hora_llegada: instante(v.vuelo.hora) };
  }
  return cuerpo;
}

export const MENSAJES_PORTAL = {
  limite_ip:
    'Se enviaron muchas solicitudes desde esta conexión (por ejemplo, el wifi del aeropuerto). Espera un momento e intenta de nuevo.',
  limite_telefono:
    'Ya enviaste varias solicitudes con este número. Si ya pediste tu viaje, revisa tu WhatsApp; si no, espera unos minutos e intenta de nuevo.',
  incierto:
    'No sabemos si tu solicitud llegó. Si en unos minutos no te llega el WhatsApp para confirmarla, vuelve a intentarlo.',
  inesperado: 'No se pudo enviar tu solicitud. Intenta de nuevo.',
} as const;

export type FallaEnvio =
  | { tipo: 'campos'; cuerpo: unknown }
  | { tipo: 'limite'; mensaje: string }
  | { tipo: 'no_disponible' }
  | { tipo: 'incierto' }
  | { tipo: 'otro'; mensaje: string };

/** Qué hacer con un error del envío. Sin respuesta o con un 5xx no se sabe si la solicitud quedó creada. */
export function clasificarFalla(error: unknown): FallaEnvio {
  if (!(error instanceof ErrorApi)) return { tipo: 'otro', mensaje: MENSAJES_PORTAL.inesperado };
  const { estado } = error;
  if (estado === 0 || estado >= 500) return { tipo: 'incierto' };
  if (estado === 400) return { tipo: 'campos', cuerpo: error.cuerpo };
  if (estado === 404) return { tipo: 'no_disponible' };
  if (estado === 429) {
    const codigo = codigoDe(error);
    if (codigo === 'limite_ip' || codigo === 'limite_telefono') return { tipo: 'limite', mensaje: MENSAJES_PORTAL[codigo] };
    return { tipo: 'limite', mensaje: detalleDe(error) ?? MENSAJES_PORTAL.limite_ip };
  }
  return { tipo: 'otro', mensaje: detalleDe(error) ?? MENSAJES_PORTAL.inesperado };
}
