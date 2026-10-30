/**
 * Filtros del listado, guardados en la URL para que sobrevivan a F5 y se puedan compartir.
 *
 * - `desde` y `hasta` van en la URL como hora de pared de Santiago («2026-09-05T23:30»): la URL se lee igual
 *   en cualquier navegador. Al llamar a la API se convierten a instantes UTC. Una hora inexistente se marca
 *   con error y ese filtro no se aplica; si es ambigua, `desde` usa la primera ocurrencia y `hasta` la
 *   segunda (el rango queda más amplio).
 * - Vista por defecto: si la URL no trae `desde`, `fecha` ni `hasta`, se aplica «desde hoy 00:00» (hoy en
 *   Santiago, calculado al cargar). Se puede quitar: la URL queda con `desde=` vacío.
 * - Los valores inválidos se descartan, los valores por defecto no se escriben y el orden de los parámetros
 *   es fijo, así los mismos filtros dan la misma URL y la misma clave de caché.
 */

import { hoy, inicioDelDia, instanteDeCampo, leerPared, aIso } from '../hora/hora';
import type { Canal, ConsultaViajes, EstadoViaje, Sentido } from './api';
import { CANALES, ORDEN_ESTADOS, ORDENES, SENTIDOS, type Orden } from './etiquetas';

export const POR_PAGINA = 25;

export interface Filtros {
  estado: EstadoViaje[];
  /** Día de recogida, «AAAA-MM-DD». */
  fecha: string | null;
  /** Hora de pared de Santiago, «AAAA-MM-DDTHH:mm». */
  desde: string | null;
  hasta: string | null;
  sentido: Sentido | null;
  canal: Canal | null;
  q: string;
  ordenar: Orden | null;
  pagina: number;
  /** La URL no trae `desde`, `fecha` ni `hasta`: se aplica «desde hoy 00:00». */
  desdeHoy: boolean;
}

export const SIN_FILTROS: Filtros = {
  estado: [],
  fecha: null,
  desde: null,
  hasta: null,
  sentido: null,
  canal: null,
  q: '',
  ordenar: null,
  pagina: 1,
  desdeHoy: false,
};

function enLista<T extends string>(valor: string | null, opciones: Record<T, string>): T | null {
  return valor !== null && Object.hasOwn(opciones, valor) ? (valor as T) : null;
}

function fechaValida(valor: string | null): string | null {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) && leerPared(`${valor}T00:00`) ? valor : null;
}

function paredValida(valor: string | null): string | null {
  return valor && leerPared(valor) ? valor : null;
}

export function leerFiltros(parametros: URLSearchParams): Filtros {
  const estados = new Set(parametros.getAll('estado'));
  const pagina = Number(parametros.get('page'));
  return {
    estado: ORDEN_ESTADOS.filter((estado) => estados.has(estado)),
    fecha: fechaValida(parametros.get('fecha')),
    desde: paredValida(parametros.get('desde')),
    hasta: paredValida(parametros.get('hasta')),
    sentido: enLista(parametros.get('sentido'), SENTIDOS),
    canal: enLista(parametros.get('canal'), CANALES),
    q: parametros.get('q') ?? '',
    ordenar: enLista(parametros.get('ordenar'), ORDENES),
    pagina: Number.isInteger(pagina) && pagina > 1 ? pagina : 1,
    desdeHoy: !parametros.has('desde') && !parametros.has('fecha') && !parametros.has('hasta'),
  };
}

export function escribirFiltros(f: Filtros): URLSearchParams {
  const parametros = new URLSearchParams();
  for (const estado of ORDEN_ESTADOS) if (f.estado.includes(estado)) parametros.append('estado', estado);
  if (f.fecha) parametros.set('fecha', f.fecha);
  if (f.desde) parametros.set('desde', f.desde);
  // Sin `desde` en la URL volvería la vista por defecto: `desde=` deja constancia de que se quitó.
  else if (!f.desdeHoy && !f.fecha && !f.hasta) parametros.set('desde', '');
  if (f.hasta) parametros.set('hasta', f.hasta);
  if (f.sentido) parametros.set('sentido', f.sentido);
  if (f.canal) parametros.set('canal', f.canal);
  if (f.q) parametros.set('q', f.q);
  if (f.ordenar) parametros.set('ordenar', f.ordenar);
  if (f.pagina > 1) parametros.set('page', String(f.pagina));
  return parametros;
}

/** Aplica cambios a los filtros. Salvo que se cambie la página, se vuelve a la primera. */
export function cambiarFiltros(f: Filtros, cambios: Partial<Filtros>): Filtros {
  const nuevos = { ...f, pagina: 1, ...cambios };
  // Un `desde` explícito, una fecha o un `hasta` reemplazan la vista por defecto.
  if (cambios.desde || cambios.fecha || cambios.hasta) nuevos.desdeHoy = false;
  return nuevos;
}

export interface ConsultaConErrores {
  consulta: ConsultaViajes;
  errores: { desde?: string; hasta?: string };
}

/** Consulta para la API a partir de los filtros. `ahora` fija «hoy» (en Santiago). */
export function consultaDeFiltros(f: Filtros, ahora: number = Date.now()): ConsultaConErrores {
  const consulta: ConsultaViajes = {};
  const errores: ConsultaConErrores['errores'] = {};
  if (f.estado.length) consulta.estado = f.estado;
  if (f.fecha) consulta.fecha = f.fecha;
  if (f.desdeHoy) consulta.desde = aIso(inicioDelDia(hoy(ahora)));
  else if (f.desde) {
    const desde = instanteDeCampo({ pared: f.desde, ocurrencia: 'primera' });
    if (desde.ok) consulta.desde = aIso(desde.instante);
    else errores.desde = desde.mensaje;
  }
  if (f.hasta) {
    const hasta = instanteDeCampo({ pared: f.hasta, ocurrencia: 'segunda' });
    if (hasta.ok) consulta.hasta = aIso(hasta.instante);
    else errores.hasta = hasta.mensaje;
  }
  if (f.sentido) consulta.sentido = f.sentido;
  if (f.canal) consulta.canal = f.canal;
  if (f.q.trim()) consulta.q = f.q.trim();
  if (f.ordenar) consulta.ordenar = [f.ordenar];
  if (f.pagina > 1) consulta.page = f.pagina;
  return { consulta, errores };
}

/** Hay algún filtro (además del orden y la página): decide el mensaje del listado vacío. */
export function hayFiltros(f: Filtros): boolean {
  return Boolean(
    f.estado.length || f.fecha || f.desde || f.hasta || f.sentido || f.canal || f.q.trim() || f.desdeHoy,
  );
}
