import { describe, expect, it } from 'vitest';
import {
  aEvento,
  aMuestra,
  celda,
  ENCABEZADO_EVENTOS,
  ENCABEZADO_MUESTRAS,
  filaEvento,
  filaMuestra,
  parsear,
} from './csv';
import type { Evento, Muestra } from './tipos';

const muestra: Muestra = {
  sesion: 'S20261028-101500',
  n: 3,
  recibida_iso: '2026-10-28T13:15:30.000Z',
  recibida_ms: 1_793_200_530_000,
  fix_ms: 1_793_200_529_400,
  modo: 'espera',
  lat: -33.456912,
  lon: -70.648299,
  precision_m: 8.5,
  velocidad_ms: null,
  rumbo: null,
  altitud_m: 540.2,
  simulada: false,
  intervalo_s: 30.1,
  callbacks: 30,
  bateria_pct: 76.5,
  cargando: false,
  segundo_plano: true,
  bytes_estimados: 168,
};

describe('celda', () => {
  it('escapa comas, comillas y saltos de línea', () => {
    expect(celda('simple')).toBe('simple');
    expect(celda('a,b')).toBe('"a,b"');
    expect(celda('dijo "hola"')).toBe('"dijo ""hola"""');
    expect(celda('dos\nlíneas')).toBe('"dos\nlíneas"');
  });

  it('deja vacíos los nulos', () => {
    expect(celda(null)).toBe('');
    expect(celda(undefined)).toBe('');
  });
});

describe('ida y vuelta', () => {
  it('una muestra se recupera igual desde el CSV', () => {
    const texto = `${ENCABEZADO_MUESTRAS}\n${filaMuestra(muestra)}\n`;
    expect(parsear(texto).map(aMuestra)).toEqual([muestra]);
  });

  it('un evento con comas y comillas en el detalle se recupera igual', () => {
    const evento: Evento = {
      sesion: 'S1',
      recibido_iso: '2026-10-28T13:15:30.000Z',
      recibido_ms: 1_793_200_530_000,
      tipo: 'error',
      detalle: 'NOT_AUTHORIZED: "Permiso denegado", reintentar',
    };
    const texto = `${ENCABEZADO_EVENTOS}\r\n${filaEvento(evento)}\r\n`;
    expect(parsear(texto).map(aEvento)).toEqual([evento]);
  });
});

describe('parsear', () => {
  it('ignora líneas vacías y tolera un archivo sin salto final', () => {
    expect(parsear('a,b\n1,2\n\n3,4')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('devuelve vacío para un archivo vacío', () => {
    expect(parsear('')).toEqual([]);
  });
});
