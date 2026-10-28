import { describe, expect, it } from 'vitest';
import { bytesEstimados, cargaEstimada, debeRegistrar, MARGEN_MS, SOBRECARGA_BYTES } from './muestreo';

describe('debeRegistrar', () => {
  it('registra la primera posición de la sesión', () => {
    expect(debeRegistrar(null, 1_000, 10)).toBe(true);
  });

  it('espera el intervalo objetivo, con margen para entregas levemente adelantadas', () => {
    expect(debeRegistrar(0, 9_000, 10)).toBe(false);
    expect(debeRegistrar(0, 10_000 - MARGEN_MS, 10)).toBe(true);
    expect(debeRegistrar(0, 29_000, 30)).toBe(false);
    expect(debeRegistrar(0, 30_000, 30)).toBe(true);
  });
});

describe('carga estimada', () => {
  const posicion = {
    fix_ms: 1_793_200_000_000,
    lat: -33.4569123456,
    lon: -70.6482987654,
    precision_m: 12.345,
    velocidad_ms: 8.26,
    rumbo: 181.6,
  };

  it('redondea a la precisión que enviaría la app real', () => {
    expect(JSON.parse(cargaEstimada(posicion))).toEqual({
      t: 1_793_200_000_000,
      lat: -33.456912,
      lon: -70.648299,
      acc: 12.3,
      vel: 8.3,
      rumbo: 182,
    });
  });

  it('suma la sobrecarga de protocolo a los bytes del mensaje', () => {
    expect(bytesEstimados(posicion)).toBe(cargaEstimada(posicion).length + SOBRECARGA_BYTES);
  });

  it('acepta velocidad y rumbo nulos', () => {
    expect(JSON.parse(cargaEstimada({ ...posicion, velocidad_ms: null, rumbo: null }))).toMatchObject({
      vel: null,
      rumbo: null,
    });
  });
});
