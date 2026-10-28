/**
 * El plugin entrega posiciones cada ~1 s (intervalo fijo de 1000 ms en su servicio Android, con
 * distanceFilter 0). La app registra solo una cada 10 s en viaje o 30 s en espera, que es lo que
 * enviaría la app real. Se decide en cada entrega del plugin y no con temporizadores, porque los
 * temporizadores de JavaScript se ralentizan con la app en segundo plano.
 */

/** Tolerancia para no saltarse una muestra cuando la entrega llega levemente antes del objetivo. */
export const MARGEN_MS = 500;

/**
 * Supuesto para estimar datos: bytes de encabezados por mensaje (trama WebSocket, registro TLS y
 * TCP/IP). Se contrasta con la lectura manual del consumo en Ajustes de Android.
 */
export const SOBRECARGA_BYTES = 80;

export function debeRegistrar(ultimaMs: number | null, ahoraMs: number, objetivoS: number): boolean {
  return ultimaMs === null || ahoraMs - ultimaMs >= objetivoS * 1000 - MARGEN_MS;
}

interface Posicion {
  fix_ms: number | null;
  lat: number;
  lon: number;
  precision_m: number;
  velocidad_ms: number | null;
  rumbo: number | null;
}

const redondear = (valor: number | null, decimales: number) =>
  valor === null ? null : Number(valor.toFixed(decimales));

/** Mensaje que la app real enviaría al backend por cada posición. */
export function cargaEstimada(p: Posicion): string {
  return JSON.stringify({
    t: p.fix_ms,
    lat: redondear(p.lat, 6),
    lon: redondear(p.lon, 6),
    acc: redondear(p.precision_m, 1),
    vel: redondear(p.velocidad_ms, 1),
    rumbo: redondear(p.rumbo, 0),
  });
}

export function bytesEstimados(p: Posicion): number {
  return new TextEncoder().encode(cargaEstimada(p)).length + SOBRECARGA_BYTES;
}
