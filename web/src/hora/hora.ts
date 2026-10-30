/**
 * Horas en America/Santiago, sin depender de la zona del navegador ni suponer un desfase fijo.
 *
 * - Una «hora de pared» es lo que muestra un reloj en Santiago (lo que escribe el usuario en un
 *   `datetime-local`, p. ej. «2026-09-05T23:30»). Un «instante» es un punto en el tiempo (milisegundos UTC).
 * - De instante a pared: `Intl.DateTimeFormat` con `timeZone: 'America/Santiago'`.
 * - De pared a instante: se lee la pared como si fuera UTC, se le restan los desfases vigentes un día antes y
 *   un día después (Chile cambia a lo más dos veces al año, de a una hora) y se quedan los candidatos que,
 *   de vuelta a pared, dan la misma hora (ida y vuelta). Cero candidatos: la hora no existe (salto de
 *   septiembre). Dos: la hora ocurre dos veces (vuelta atrás de abril).
 * - A la API se envía siempre el instante en UTC (`toISOString()`, con «Z»).
 *
 * Los datos de zona son los del navegador (ICU). Solo este módulo puede leer fechas por partes: ESLint
 * prohíbe getHours, getTimezoneOffset, toLocaleString, etc. fuera de src/hora/.
 */

export const ZONA = 'America/Santiago';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

export interface Pared {
  anio: number;
  /** 1 a 12. */
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
}

export type Ocurrencia = 'primera' | 'segunda';

export type Resolucion =
  | { tipo: 'inexistente' }
  | { tipo: 'unica'; instante: number }
  | { tipo: 'ambigua'; primera: number; segunda: number };

const formatoPartes = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
});

const formatoDiaSemana = new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, weekday: 'short' });

function dos(n: number): string {
  return String(n).padStart(2, '0');
}

function partes(instante: number): Pared & { segundo: number } {
  const valores: Record<string, number> = {};
  for (const parte of formatoPartes.formatToParts(instante)) {
    if (parte.type !== 'literal') valores[parte.type] = Number(parte.value);
  }
  return {
    anio: valores.year,
    mes: valores.month,
    dia: valores.day,
    // Algunos motores devuelven 24 a medianoche aun con h23.
    hora: valores.hour % 24,
    minuto: valores.minute,
    segundo: valores.second,
  };
}

/** Hora de pared en Santiago de un instante (sin segundos). */
export function paredDe(instante: number): Pared {
  const { anio, mes, dia, hora, minuto } = partes(instante);
  return { anio, mes, dia, hora, minuto };
}

function comoUtc(p: Pared): number {
  return Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto);
}

/** Desfase de Santiago respecto de UTC en ese instante, en milisegundos (p. ej. −3 h en verano). */
export function desfase(instante: number): number {
  const p = partes(instante);
  const sinMilisegundos = instante - (((instante % 1000) + 1000) % 1000);
  return Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - sinMilisegundos;
}

function iguales(a: Pared, b: Pared): boolean {
  return a.anio === b.anio && a.mes === b.mes && a.dia === b.dia && a.hora === b.hora && a.minuto === b.minuto;
}

/** Instante(s) que corresponden a una hora de pared en Santiago. */
export function resolver(p: Pared): Resolucion {
  const base = comoUtc(p);
  const desfases = new Set([desfase(base - DIA), desfase(base + DIA)]);
  const candidatos = [...new Set([...desfases].map((d) => base - d))]
    .filter((instante) => iguales(paredDe(instante), p))
    .sort((a, b) => a - b);
  if (candidatos.length === 0) return { tipo: 'inexistente' };
  if (candidatos.length === 1) return { tipo: 'unica', instante: candidatos[0] };
  return { tipo: 'ambigua', primera: candidatos[0], segunda: candidatos[candidatos.length - 1] };
}

const PATRON_PARED = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::00(?:\.000)?)?$/;

/** Lee «AAAA-MM-DDTHH:mm» (el valor de un `datetime-local`). null si el formato o la fecha no son válidos. */
export function leerPared(texto: string): Pared | null {
  const coincidencia = PATRON_PARED.exec(texto);
  if (!coincidencia) return null;
  const [anio, mes, dia, hora, minuto] = coincidencia.slice(1).map(Number);
  const p = { anio, mes, dia, hora, minuto };
  if (hora > 23 || minuto > 59) return null;
  // Descarta fechas que no existen en el calendario (31-04, 29-02 de un año no bisiesto…).
  const normalizada = new Date(comoUtc(p));
  if (normalizada.getUTCMonth() + 1 !== mes || normalizada.getUTCDate() !== dia) return null;
  return p;
}

export function escribirPared(p: Pared): string {
  return `${p.anio}-${dos(p.mes)}-${dos(p.dia)}T${dos(p.hora)}:${dos(p.minuto)}`;
}

export function escribirFecha(p: Pared): string {
  return `${p.anio}-${dos(p.mes)}-${dos(p.dia)}`;
}

/** «hoy» en Santiago, como «AAAA-MM-DD». */
export function hoy(ahora: number = Date.now()): string {
  return escribirFecha(paredDe(ahora));
}

/**
 * Instante en que empieza un día («AAAA-MM-DD») en Santiago. Normalmente las 00:00; el día del salto de
 * septiembre las 00:00 no existen y el día empieza a la 01:00 (el primer minuto después del salto).
 */
export function inicioDelDia(fecha: string): number {
  const p = leerPared(`${fecha}T00:00`);
  if (!p) throw new Error(`Fecha inválida: ${fecha}`);
  const r = resolver(p);
  if (r.tipo === 'unica') return r.instante;
  if (r.tipo === 'ambigua') return r.primera;
  // Con el desfase de antes del salto, las 00:00 caen justo en el primer minuto válido.
  const base = comoUtc(p);
  return base - desfase(base - DIA);
}

/** «UTC−3», «UTC−4» (con signo menos tipográfico). */
export function textoDesfase(instante: number): string {
  const minutos = Math.round(desfase(instante) / MINUTO);
  const signo = minutos < 0 ? '−' : '+';
  const absoluto = Math.abs(minutos);
  const resto = absoluto % 60;
  return `UTC${signo}${Math.floor(absoluto / 60)}${resto ? `:${dos(resto)}` : ''}`;
}

function sumarMinutos(p: Pared, minutos: number): Pared {
  const fecha = new Date(comoUtc(p) + minutos * MINUTO);
  return {
    anio: fecha.getUTCFullYear(),
    mes: fecha.getUTCMonth() + 1,
    dia: fecha.getUTCDate(),
    hora: fecha.getUTCHours(),
    minuto: fecha.getUTCMinutes(),
  };
}

function textoFecha(p: Pared): string {
  return `${dos(p.dia)}-${dos(p.mes)}-${p.anio}`;
}

function textoHora(p: Pared): string {
  return `${dos(p.hora)}:${dos(p.minuto)}`;
}

/** Mensaje para una hora que no existe: indica el tramo que se salta el reloj y la primera hora válida. */
export function mensajeInexistente(p: Pared): string {
  const base = comoUtc(p);
  // Instante del cambio: entre la pared leída con el desfase de después y con el de antes.
  let desde = base - desfase(base + DIA);
  let hasta = base - desfase(base - DIA);
  while (hasta - desde > MINUTO) {
    const medio = desde + Math.floor((hasta - desde) / MINUTO / 2) * MINUTO;
    if (desfase(medio) === desfase(desde)) desde = medio;
    else hasta = medio;
  }
  const primeraFaltante = sumarMinutos(paredDe(desde), 1);
  const primeraValida = paredDe(hasta);
  const ultimaFaltante = sumarMinutos(primeraValida, -1);
  return (
    `Esa hora no existe en Chile por el cambio al horario de verano ` +
    `(de ${textoHora(primeraFaltante)} a ${textoHora(ultimaFaltante)} del ${textoFecha(primeraFaltante)}). ` +
    `Elige ${textoHora(primeraValida)} o después.`
  );
}

/** Valor de un campo de fecha y hora del formulario: la pared escrita y, si se repite, cuál ocurrencia. */
export interface ValorFechaHora {
  pared: string;
  ocurrencia: Ocurrencia;
}

export type InstanteDeCampo =
  | { ok: true; instante: number; ambigua: boolean }
  | { ok: false; motivo: 'formato' | 'inexistente'; mensaje: string };

export function instanteDeCampo({ pared, ocurrencia }: ValorFechaHora): InstanteDeCampo {
  const p = leerPared(pared);
  if (!p) return { ok: false, motivo: 'formato', mensaje: 'Ingresa una fecha y hora válidas.' };
  const r = resolver(p);
  if (r.tipo === 'inexistente') return { ok: false, motivo: 'inexistente', mensaje: mensajeInexistente(p) };
  if (r.tipo === 'unica') return { ok: true, instante: r.instante, ambigua: false };
  return { ok: true, instante: ocurrencia === 'segunda' ? r.segunda : r.primera, ambigua: true };
}

/** Valor inicial de un campo a partir de un instante de la API (conserva cuál ocurrencia era). */
export function campoDeInstante(iso: string): ValorFechaHora {
  const instante = Date.parse(iso);
  const p = paredDe(instante);
  const r = resolver(p);
  const ocurrencia: Ocurrencia = r.tipo === 'ambigua' && instante === r.segunda ? 'segunda' : 'primera';
  return { pared: escribirPared(p), ocurrencia };
}

/** Las dos ocurrencias de una pared repetida, con su desfase; null si no se repite. */
export function ocurrencias(pared: string): { primera: string; segunda: string } | null {
  const p = leerPared(pared);
  const r = p && resolver(p);
  if (!r || r.tipo !== 'ambigua') return null;
  return { primera: textoDesfase(r.primera), segunda: textoDesfase(r.segunda) };
}

export function aIso(instante: number): string {
  return new Date(instante).toISOString();
}

/**
 * «sáb 04-04-2026 23:30» en Santiago. Si la hora es una de las repetidas del cambio de abril se agrega el
 * desfase, porque si no las dos ocurrencias se verían iguales: «sáb 04-04-2026 23:30 (UTC−4)».
 */
export function formatearFechaHora(iso: string): string {
  const instante = Date.parse(iso);
  const p = paredDe(instante);
  const diaSemana = formatoDiaSemana.format(instante).replace('.', '');
  const texto = `${diaSemana} ${textoFecha(p)} ${textoHora(p)}`;
  return resolver(p).tipo === 'ambigua' ? `${texto} (${textoDesfase(instante)})` : texto;
}

/** «04-04-2026» a partir de «2026-04-04» (fecha sin hora, ya en Santiago). */
export function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}-${mes}-${anio}`;
}

/** «04-04-2026 23:30» a partir de una pared «2026-04-04T23:30» (para mostrar filtros). */
export function formatearPared(pared: string): string {
  const p = leerPared(pared);
  return p ? `${textoFecha(p)} ${textoHora(p)}` : pared;
}
