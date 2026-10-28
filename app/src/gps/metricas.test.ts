import { describe, expect, it } from 'vitest';
import { percentil, porSesion, resumir } from './metricas';
import type { Modo, Muestra } from './tipos';

const INICIO = 1_793_200_000_000;

/** Muestras sintéticas: una cada `intervalos[i]` segundos desde INICIO. */
function serie(intervalos: number[], extra: Partial<Muestra> = {}, modo: Modo = 'viaje'): Muestra[] {
  let t = INICIO;
  return [0, ...intervalos].map((intervalo, i) => {
    t += intervalo * 1000;
    return {
      sesion: 'S1',
      n: i + 1,
      recibida_iso: new Date(t).toISOString(),
      recibida_ms: t,
      fix_ms: t,
      modo,
      lat: -33.45,
      lon: -70.65,
      precision_m: 10,
      velocidad_ms: null,
      rumbo: null,
      altitud_m: null,
      simulada: false,
      intervalo_s: i === 0 ? null : intervalo,
      callbacks: 10,
      bateria_pct: null,
      cargando: null,
      segundo_plano: true,
      bytes_estimados: 150,
      ...extra,
    };
  });
}

describe('percentil', () => {
  it('usa rango más cercano', () => {
    expect(percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentil([7], 95)).toBe(7);
  });

  it('devuelve null sin datos', () => {
    expect(percentil([], 50)).toBeNull();
  });
});

describe('resumir', () => {
  it('devuelve null sin muestras', () => {
    expect(resumir([])).toBeNull();
  });

  it('calcula intervalos por modo contra su objetivo', () => {
    const muestras = [...serie([10, 10, 11]), ...serie([30, 31], {}, 'espera').slice(1)];
    const r = resumir(muestras)!;
    expect(r.por_modo.viaje).toMatchObject({ objetivo_s: 10, intervalos: 3, mediana_s: 10, max_s: 11 });
    expect(r.por_modo.espera).toMatchObject({ objetivo_s: 30, intervalos: 2, max_s: 31 });
  });

  it('cuenta huecos sobre 60 s y marca incumplimiento', () => {
    const r = resumir(serie([10, 75, 10, 61]))!;
    expect(r.huecos).toBe(2);
    expect(r.hueco_max_s).toBe(75);
    expect(r.cumple_huecos).toBe(false);
  });

  it('un hueco de exactamente 60 s todavía cumple', () => {
    expect(resumir(serie([60, 10]))!.cumple_huecos).toBe(true);
  });

  it('evalúa la precisión p95 contra 50 m', () => {
    const buenas = serie(Array(19).fill(10));
    expect(resumir(buenas)!.cumple_precision).toBe(true);
    const malas = buenas.map((m, i) => (i >= 18 ? { ...m, precision_m: 80 } : m));
    expect(resumir(malas)!.precision_p95_m).toBe(80);
    expect(resumir(malas)!.cumple_precision).toBe(false);
  });

  it('proyecta datos a un turno de 8 h', () => {
    // 361 muestras de 150 bytes en 1 h = 54 150 bytes/h.
    const r = resumir(serie(Array(360).fill(10)))!;
    expect(r.duracion_h).toBeCloseTo(1);
    expect(r.mb_hora).toBeCloseTo(0.05415);
    expect(r.mb_turno).toBeCloseTo(0.4332);
    expect(r.cumple_datos).toBe(true);
  });

  it('no evalúa datos con una sola muestra', () => {
    const r = resumir(serie([]))!;
    expect(r.mb_hora).toBeNull();
    expect(r.cumple_datos).toBeNull();
  });

  it('mide batería solo en tramos sin cargar', () => {
    const muestras = serie([1800, 1800, 1800]).map((m, i) => ({
      ...m,
      bateria_pct: [80, 77, 77, 74][i],
      cargando: i === 2 ? true : false,
    }));
    // Tramo 0→1 sin cargar: 3 % en 0,5 h. Los tramos que tocan la muestra 2 (cargando) se descartan.
    expect(resumir(muestras)!.bateria_pct_h).toBeCloseTo(6);
  });

  it('sin datos de batería devuelve null', () => {
    expect(resumir(serie([10, 10]))!.bateria_pct_h).toBeNull();
  });
});

describe('porSesion', () => {
  it('agrupa conservando el orden', () => {
    const a = serie([10]);
    const b = serie([10], { sesion: 'S2' });
    const grupos = porSesion([a[0], b[0], a[1], b[1]]);
    expect([...grupos.keys()]).toEqual(['S1', 'S2']);
    expect(grupos.get('S1')!.map((m) => m.n)).toEqual([1, 2]);
  });
});
