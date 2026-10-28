import {
  DATOS_TURNO_MAX_MB,
  HORAS_TURNO,
  HUECO_MAXIMO_S,
  INTERVALO_OBJETIVO_S,
  PRECISION_P95_MAX_M,
  type Modo,
  type Muestra,
} from './tipos';

const MS_POR_HORA = 3_600_000;
const BYTES_POR_MB = 1_000_000;

/** Percentil por rango más cercano. */
export function percentil(valores: number[], p: number): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const indice = Math.ceil((p / 100) * orden.length) - 1;
  return orden[Math.min(Math.max(indice, 0), orden.length - 1)];
}

export interface ResumenModo {
  objetivo_s: number;
  intervalos: number;
  mediana_s: number | null;
  p95_s: number | null;
  max_s: number | null;
}

export interface Resumen {
  sesion: string;
  inicio_ms: number;
  fin_ms: number;
  duracion_h: number;
  muestras: number;
  por_modo: Record<Modo, ResumenModo>;
  huecos: number;
  hueco_max_s: number | null;
  precision_mediana_m: number | null;
  precision_p95_m: number | null;
  /** Descarga de batería en tramos sin cargar; null si no hay tramos suficientes. */
  bateria_pct_h: number | null;
  mb_hora: number | null;
  mb_turno: number | null;
  cumple_huecos: boolean;
  cumple_precision: boolean | null;
  cumple_datos: boolean | null;
}

function resumenModo(muestras: Muestra[], modo: Modo): ResumenModo {
  const intervalos = muestras
    .filter((m) => m.modo === modo && m.intervalo_s !== null)
    .map((m) => m.intervalo_s as number);
  return {
    objetivo_s: INTERVALO_OBJETIVO_S[modo],
    intervalos: intervalos.length,
    mediana_s: percentil(intervalos, 50),
    p95_s: percentil(intervalos, 95),
    max_s: intervalos.length ? Math.max(...intervalos) : null,
  };
}

/** Pérdida de batería por hora, considerando solo pares de muestras consecutivas sin cargar. */
function bateriaPorHora(muestras: Muestra[]): number | null {
  let caida = 0;
  let horas = 0;
  for (let i = 1; i < muestras.length; i++) {
    const a = muestras[i - 1];
    const b = muestras[i];
    if (a.cargando !== false || b.cargando !== false) continue;
    if (a.bateria_pct === null || b.bateria_pct === null) continue;
    caida += a.bateria_pct - b.bateria_pct;
    horas += (b.recibida_ms - a.recibida_ms) / MS_POR_HORA;
  }
  return horas > 0 ? caida / horas : null;
}

/** Resumen de una sesión. Las muestras deben ser de una sola sesión, en orden de llegada. */
export function resumir(muestras: Muestra[]): Resumen | null {
  if (muestras.length === 0) return null;
  const inicio = muestras[0].recibida_ms;
  const fin = muestras[muestras.length - 1].recibida_ms;
  const duracionH = (fin - inicio) / MS_POR_HORA;

  const intervalos = muestras.filter((m) => m.intervalo_s !== null).map((m) => m.intervalo_s as number);
  const precisiones = muestras.map((m) => m.precision_m);
  const bytes = muestras.reduce((total, m) => total + m.bytes_estimados, 0);
  const mbHora = duracionH > 0 ? bytes / BYTES_POR_MB / duracionH : null;
  const p95Precision = percentil(precisiones, 95);

  return {
    sesion: muestras[0].sesion,
    inicio_ms: inicio,
    fin_ms: fin,
    duracion_h: duracionH,
    muestras: muestras.length,
    por_modo: { viaje: resumenModo(muestras, 'viaje'), espera: resumenModo(muestras, 'espera') },
    huecos: intervalos.filter((s) => s > HUECO_MAXIMO_S).length,
    hueco_max_s: intervalos.length ? Math.max(...intervalos) : null,
    precision_mediana_m: percentil(precisiones, 50),
    precision_p95_m: p95Precision,
    bateria_pct_h: bateriaPorHora(muestras),
    mb_hora: mbHora,
    mb_turno: mbHora === null ? null : mbHora * HORAS_TURNO,
    cumple_huecos: intervalos.every((s) => s <= HUECO_MAXIMO_S),
    cumple_precision: p95Precision === null ? null : p95Precision <= PRECISION_P95_MAX_M,
    cumple_datos: mbHora === null ? null : mbHora * HORAS_TURNO < DATOS_TURNO_MAX_MB,
  };
}

/** Agrupa muestras por sesión, conservando el orden de llegada. */
export function porSesion(muestras: Muestra[]): Map<string, Muestra[]> {
  const grupos = new Map<string, Muestra[]>();
  for (const m of muestras) {
    const grupo = grupos.get(m.sesion);
    if (grupo) grupo.push(m);
    else grupos.set(m.sesion, [m]);
  }
  return grupos;
}
