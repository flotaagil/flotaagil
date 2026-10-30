/**
 * Formulario de reserva (crear y editar): valores, validación y armado del cuerpo para la API.
 *
 * - Teléfono: si el valor tiene exactamente 9 dígitos y empieza con 9 (separadores aparte), se completa a
 *   +569XXXXXXXX en el mismo campo, a la vista, antes de validar y enviar. Cualquier otro valor se exige en
 *   E.164, con la misma normalización y el mismo patrón que el backend.
 * - Horas: hora de pared de Santiago; una hora inexistente se rechaza y una repetida usa la ocurrencia
 *   elegida (por defecto la primera). A la API va el instante en UTC.
 * - Vuelo: solo con DESDE_AEROPUERTO. Con otro sentido no se valida ni se envía.
 * - Al editar se envían solo los campos modificados: así no se reemplaza el vuelo (y su ETA, HU-27) ni la
 *   hora si no se tocaron. Pasajero y canal no se editan (el PATCH no los acepta, PR-03).
 */

import { z } from 'zod';
import { aIso, campoDeInstante, instanteDeCampo, type ValorFechaHora } from '../hora/hora';
import type { CanalPanel, Sentido, ViajeCrear, ViajeDetalle, ViajeEditar } from './api';

export type Modo = 'crear' | 'editar';

export const CANALES_PANEL: CanalPanel[] = ['TELEFONO', 'WHATSAPP'];
export const SENTIDOS_FORMULARIO: Sentido[] = ['URBANO', 'HACIA_AEROPUERTO', 'DESDE_AEROPUERTO'];

/** Campos que muestra cada modo (para ubicar los errores 400 del backend). */
export const CAMPOS_DEL_MODO: Record<Modo, readonly string[]> = {
  crear: ['pasajero.nombre', 'pasajero.telefono', 'canal', 'sentido', 'origen_dir', 'destino_dir', 'recogida', 'vuelo.numero', 'vuelo.hora'],
  editar: ['sentido', 'origen_dir', 'destino_dir', 'recogida', 'vuelo.numero', 'vuelo.hora'],
};

const SIN_HORA: ValorFechaHora = { pared: '', ocurrencia: 'primera' };

export interface ValoresReserva {
  pasajero: { nombre: string; telefono: string };
  canal: 'TELEFONO' | 'WHATSAPP';
  sentido: Sentido;
  origen_dir: string;
  destino_dir: string;
  recogida: ValorFechaHora;
  vuelo: { numero: string; hora: ValorFechaHora };
}

export const VALORES_NUEVA: ValoresReserva = {
  pasajero: { nombre: '', telefono: '' },
  canal: 'TELEFONO',
  sentido: 'URBANO',
  origen_dir: '',
  destino_dir: '',
  recogida: SIN_HORA,
  vuelo: { numero: '', hora: SIN_HORA },
};

export function valoresDeViaje(viaje: ViajeDetalle): ValoresReserva {
  return {
    pasajero: { nombre: viaje.pasajero.nombre, telefono: viaje.pasajero.telefono },
    canal: viaje.canal === 'WHATSAPP' ? 'WHATSAPP' : 'TELEFONO',
    sentido: viaje.sentido ?? 'URBANO',
    origen_dir: viaje.origen.direccion,
    destino_dir: viaje.destino.direccion,
    recogida: campoDeInstante(viaje.recogida_en),
    vuelo: viaje.vuelo
      ? { numero: viaje.vuelo.numero, hora: campoDeInstante(viaje.vuelo.hora_programada) }
      : { numero: '', hora: SIN_HORA },
  };
}

/** «+56 9 1234-5678» → «+56912345678» (igual que normalizar_telefono del backend). */
export function normalizarTelefono(valor: string): string {
  return [...valor].filter((c) => /\d/.test(c) || c === '+').join('');
}

/** 9 dígitos que empiezan con 9 (un móvil chileno sin prefijo) → +569XXXXXXXX. Otro valor queda igual. */
export function completarTelefono(valor: string): string {
  const soloDigitos = valor.replace(/[\s\-().]/g, '');
  return /^9\d{8}$/.test(soloDigitos) ? `+56${soloDigitos}` : valor;
}

const E164 = /^\+[1-9]\d{7,14}$/;
const VUELO_IATA = /^[A-Z0-9]{2} ?\d{1,4}$/;

export function normalizarVuelo(numero: string): string {
  return numero.toUpperCase().split(/\s+/).filter(Boolean).join(' ');
}

const fechaHora = z.object({ pared: z.string(), ocurrencia: z.enum(['primera', 'segunda']) });

export function esquemaReserva(modo: Modo) {
  return z
    .object({
      pasajero: z.object({ nombre: z.string(), telefono: z.string() }),
      canal: z.enum(['TELEFONO', 'WHATSAPP']),
      sentido: z.enum(['URBANO', 'HACIA_AEROPUERTO', 'DESDE_AEROPUERTO']),
      origen_dir: z.string(),
      destino_dir: z.string(),
      recogida: fechaHora,
      vuelo: z.object({ numero: z.string(), hora: fechaHora }),
    })
    .superRefine((v, ctx) => {
      const error = (ruta: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path: ruta, message });
      if (modo === 'crear') {
        const nombre = v.pasajero.nombre.trim();
        if (!nombre) error(['pasajero', 'nombre'], 'Ingresa el nombre del pasajero.');
        else if (nombre.length > 80) error(['pasajero', 'nombre'], 'Máximo 80 caracteres.');
        if (!E164.test(normalizarTelefono(v.pasajero.telefono))) {
          error(['pasajero', 'telefono'], 'Teléfono en formato E.164, p. ej. +56912345678.');
        }
      }
      for (const [campo, nombre] of [['origen_dir', 'origen'], ['destino_dir', 'destino']] as const) {
        const valor = v[campo].trim();
        if (!valor) error([campo], `Ingresa la dirección de ${nombre}.`);
        else if (valor.length > 200) error([campo], 'Máximo 200 caracteres.');
      }
      const recogida = instanteDeCampo(v.recogida);
      if (!recogida.ok) error(['recogida'], v.recogida.pared ? recogida.mensaje : 'Ingresa la fecha y hora de recogida.');
      if (v.sentido === 'DESDE_AEROPUERTO') {
        const numero = normalizarVuelo(v.vuelo.numero);
        const conHora = v.vuelo.hora.pared !== '';
        if (numero && !VUELO_IATA.test(numero)) error(['vuelo', 'numero'], 'Número de vuelo IATA, p. ej. LA123 o H2 456.');
        if (!numero && conHora) error(['vuelo', 'numero'], 'Ingresa el número del vuelo.');
        if (numero && !conHora) error(['vuelo', 'hora'], 'Ingresa la hora programada de llegada.');
        if (conHora) {
          const hora = instanteDeCampo(v.vuelo.hora);
          if (!hora.ok) error(['vuelo', 'hora'], hora.mensaje);
        }
      }
    });
}

function instante(valor: ValorFechaHora): string {
  const resultado = instanteDeCampo(valor);
  if (!resultado.ok) throw new Error(resultado.mensaje); // ya validado por el esquema
  return aIso(resultado.instante);
}

function vueloDe(v: ValoresReserva): ViajeCrear['vuelo'] {
  const numero = normalizarVuelo(v.vuelo.numero);
  return numero ? { numero, hora_programada: instante(v.vuelo.hora) } : null;
}

export function cuerpoCrear(v: ValoresReserva): ViajeCrear {
  const cuerpo: ViajeCrear = {
    pasajero: { nombre: v.pasajero.nombre.trim(), telefono: normalizarTelefono(v.pasajero.telefono) },
    canal: v.canal,
    sentido: v.sentido,
    origen_dir: v.origen_dir.trim(),
    destino_dir: v.destino_dir.trim(),
    recogida_en: instante(v.recogida),
  };
  const vuelo = v.sentido === 'DESDE_AEROPUERTO' ? vueloDe(v) : null;
  if (vuelo) cuerpo.vuelo = vuelo;
  return cuerpo;
}

/**
 * Campos modificados según React Hook Form (`formState.dirtyFields`). Un objeto cambiado entero (la hora,
 * con Controller) puede venir como `true` o como objeto con sus partes en `true`.
 */
type Marca = boolean | { [parte: string]: Marca | undefined };

export interface Modificados {
  sentido?: Marca;
  origen_dir?: Marca;
  destino_dir?: Marca;
  recogida?: Marca;
  vuelo?: Marca;
}

function tocado(marca: Marca | undefined): boolean {
  if (typeof marca === 'object') return Object.values(marca).some(tocado);
  return marca === true;
}

export function cuerpoEditar(v: ValoresReserva, modificados: Modificados): ViajeEditar {
  const cuerpo: ViajeEditar = {};
  if (tocado(modificados.sentido)) cuerpo.sentido = v.sentido;
  if (tocado(modificados.origen_dir)) cuerpo.origen_dir = v.origen_dir.trim();
  if (tocado(modificados.destino_dir)) cuerpo.destino_dir = v.destino_dir.trim();
  if (tocado(modificados.recogida)) cuerpo.recogida_en = instante(v.recogida);
  // Con otro sentido el backend quita el vuelo solo; con DESDE_AEROPUERTO se envía si se tocó (vacío = quitarlo).
  if (v.sentido === 'DESDE_AEROPUERTO' && tocado(modificados.vuelo)) cuerpo.vuelo = vueloDe(v);
  return cuerpo;
}
