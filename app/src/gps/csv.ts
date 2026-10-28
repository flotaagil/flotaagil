import { COLUMNAS_EVENTO, COLUMNAS_MUESTRA, type Evento, type Modo, type Muestra, type TipoEvento } from './tipos';

export function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

export function fila<T extends object>(columnas: readonly (keyof T)[], objeto: T): string {
  return columnas.map((c) => celda(objeto[c])).join(',');
}

export const encabezado = (columnas: readonly string[]) => columnas.join(',');

/** Parser de CSV con comillas dobles (RFC 4180). Devuelve un objeto por fila usando el encabezado. */
export function parsear(texto: string): Record<string, string>[] {
  const filas: string[][] = [];
  let actual: string[] = [];
  let campo = '';
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        entreComillas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === ',') {
      actual.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      actual.push(campo);
      filas.push(actual);
      actual = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo !== '' || actual.length > 0) {
    actual.push(campo);
    filas.push(actual);
  }
  const [cabecera, ...datos] = filas.filter((f) => !(f.length === 1 && f[0] === ''));
  if (!cabecera) return [];
  return datos.map((f) => Object.fromEntries(cabecera.map((col, i) => [col, f[i] ?? ''])));
}

const numero = (v: string) => (v === '' ? null : Number(v));
const booleano = (v: string) => (v === '' ? null : v === 'true');

export function aMuestra(r: Record<string, string>): Muestra {
  return {
    sesion: r.sesion,
    n: Number(r.n),
    recibida_iso: r.recibida_iso,
    recibida_ms: Number(r.recibida_ms),
    fix_ms: numero(r.fix_ms),
    modo: r.modo as Modo,
    lat: Number(r.lat),
    lon: Number(r.lon),
    precision_m: Number(r.precision_m),
    velocidad_ms: numero(r.velocidad_ms),
    rumbo: numero(r.rumbo),
    altitud_m: numero(r.altitud_m),
    simulada: r.simulada === 'true',
    intervalo_s: numero(r.intervalo_s),
    callbacks: Number(r.callbacks),
    bateria_pct: numero(r.bateria_pct),
    cargando: booleano(r.cargando),
    segundo_plano: r.segundo_plano === 'true',
    bytes_estimados: Number(r.bytes_estimados),
  };
}

export function aEvento(r: Record<string, string>): Evento {
  return {
    sesion: r.sesion,
    recibido_iso: r.recibido_iso,
    recibido_ms: Number(r.recibido_ms),
    tipo: r.tipo as TipoEvento,
    detalle: r.detalle,
  };
}

export const ENCABEZADO_MUESTRAS = encabezado(COLUMNAS_MUESTRA);
export const ENCABEZADO_EVENTOS = encabezado(COLUMNAS_EVENTO);
export const filaMuestra = (m: Muestra) => fila(COLUMNAS_MUESTRA, m);
export const filaEvento = (e: Evento) => fila(COLUMNAS_EVENTO, e);
