/** Modo de operación del conductor durante la prueba. */
export type Modo = 'viaje' | 'espera';

/** Intervalo objetivo entre posiciones registradas, según el informe (H-3). */
export const INTERVALO_OBJETIVO_S: Record<Modo, number> = { viaje: 10, espera: 30 };

/** Hueco máximo tolerado: sobre este umbral HU-02 marca la posición como no confiable. */
export const HUECO_MAXIMO_S = 60;

/** Propuesta del equipo, no del informe: la geocerca de EN_ZONA es de 150 m. */
export const PRECISION_P95_MAX_M = 50;

/** RNF-07: consumo de datos máximo por turno. */
export const DATOS_TURNO_MAX_MB = 50;
export const HORAS_TURNO = 8;

/** Posición registrada por la app (una fila de posiciones.csv). */
export interface Muestra {
  sesion: string;
  n: number;
  recibida_iso: string;
  recibida_ms: number;
  fix_ms: number | null;
  modo: Modo;
  lat: number;
  lon: number;
  precision_m: number;
  velocidad_ms: number | null;
  rumbo: number | null;
  altitud_m: number | null;
  simulada: boolean;
  /** Segundos desde la muestra anterior de la misma sesión. */
  intervalo_s: number | null;
  /** Posiciones entregadas por el plugin desde la muestra anterior. */
  callbacks: number;
  bateria_pct: number | null;
  cargando: boolean | null;
  segundo_plano: boolean;
  bytes_estimados: number;
}

export type TipoEvento =
  | 'inicio'
  | 'fin'
  | 'segundo_plano'
  | 'primer_plano'
  | 'modo'
  | 'interrumpida'
  | 'error';

/** Evento de la sesión (una fila de eventos.csv). */
export interface Evento {
  sesion: string;
  recibido_iso: string;
  recibido_ms: number;
  tipo: TipoEvento;
  detalle: string;
}

export const COLUMNAS_MUESTRA = [
  'sesion', 'n', 'recibida_iso', 'recibida_ms', 'fix_ms', 'modo', 'lat', 'lon', 'precision_m',
  'velocidad_ms', 'rumbo', 'altitud_m', 'simulada', 'intervalo_s', 'callbacks', 'bateria_pct',
  'cargando', 'segundo_plano', 'bytes_estimados',
] as const satisfies readonly (keyof Muestra)[];

export const COLUMNAS_EVENTO = [
  'sesion', 'recibido_iso', 'recibido_ms', 'tipo', 'detalle',
] as const satisfies readonly (keyof Evento)[];
