/**
 * Las conversiones no deben depender de la zona del navegador. Cada bloque cambia la zona del proceso
 * (process.env.TZ, que Node aplica en caliente) y comprueba primero que el cambio surtió efecto, para que la
 * prueba no pase sin estar probando nada.
 *
 * Cambios de horario de Chile en 2026 (tzdata de ICU):
 * - 5 de septiembre: a las 23:59 (−04:00) le sigue 01:00 del 6 (−03:00); de 00:00 a 00:59 del 6 no existen.
 * - 4 de abril: a las 23:59 (−03:00) le sigue 23:00 (−04:00); de 23:00 a 23:59 ocurren dos veces.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cambiarZona } from '../pruebas/zona';
import {
  campoDeInstante,
  desfase,
  escribirPared,
  formatearFecha,
  formatearFechaHora,
  formatearPared,
  hoy,
  inicioDelDia,
  instanteDeCampo,
  leerPared,
  mensajeInexistente,
  ocurrencias,
  paredDe,
  resolver,
  textoDesfase,
} from './hora';

const ZONAS: [string, number][] = [
  // [zona, desfase de getTimezoneOffset() el 1 de enero de 2026, en minutos]
  ['UTC', 0],
  ['Europe/Madrid', -60],
  ['Asia/Tokyo', -540],
  ['America/Santiago', 180],
];

function instante(iso: string): number {
  return Date.parse(iso);
}

function resolverTexto(texto: string) {
  const p = leerPared(texto);
  if (!p) throw new Error(`Pared inválida: ${texto}`);
  return resolver(p);
}

describe.each(ZONAS)('con el navegador en %s', (zona, desfaseEsperado) => {
  let restaurar = () => {};
  beforeAll(() => {
    restaurar = cambiarZona(zona);
  });
  afterAll(() => restaurar());

  it('la zona del proceso cambió de verdad', () => {
    expect(new Date(Date.UTC(2026, 0, 1)).getTimezoneOffset()).toBe(desfaseEsperado);
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zona === 'UTC' ? 'UTC' : zona);
  });

  it.each([
    ['2026-07-15T10:00', '2026-07-15T14:00:00.000Z', 'UTC−4'], // invierno
    ['2026-01-15T10:00', '2026-01-15T13:00:00.000Z', 'UTC−3'], // verano
    ['2026-09-06T01:00', '2026-09-06T04:00:00.000Z', 'UTC−3'], // primera hora válida tras el salto
    ['2026-09-05T23:59', '2026-09-06T03:59:00.000Z', 'UTC−4'], // última antes del salto
    ['2026-04-04T22:59', '2026-04-05T01:59:00.000Z', 'UTC−3'], // última antes de la hora repetida
    ['2026-04-05T00:00', '2026-04-05T04:00:00.000Z', 'UTC−4'], // primera después de la hora repetida
  ])('%s es única: %s (%s)', (pared, iso, texto) => {
    expect(resolverTexto(pared)).toEqual({ tipo: 'unica', instante: instante(iso) });
    expect(textoDesfase(instante(iso))).toBe(texto);
  });

  it.each(['2026-09-06T00:00', '2026-09-06T00:30', '2026-09-06T00:59'])('%s no existe (septiembre)', (pared) => {
    expect(resolverTexto(pared)).toEqual({ tipo: 'inexistente' });
    expect(instanteDeCampo({ pared, ocurrencia: 'primera' })).toEqual({
      ok: false,
      motivo: 'inexistente',
      mensaje:
        'Esa hora no existe en Chile por el cambio al horario de verano (de 00:00 a 00:59 del 06-09-2026). ' +
        'Elige 01:00 o después.',
    });
  });

  it.each([
    ['2026-04-04T23:00', '2026-04-05T02:00:00.000Z', '2026-04-05T03:00:00.000Z'],
    ['2026-04-04T23:30', '2026-04-05T02:30:00.000Z', '2026-04-05T03:30:00.000Z'],
    ['2026-04-04T23:59', '2026-04-05T02:59:00.000Z', '2026-04-05T03:59:00.000Z'],
  ])('%s ocurre dos veces (abril): primera %s, segunda %s', (pared, primera, segunda) => {
    expect(resolverTexto(pared)).toEqual({ tipo: 'ambigua', primera: instante(primera), segunda: instante(segunda) });
    expect(ocurrencias(pared)).toEqual({ primera: 'UTC−3', segunda: 'UTC−4' });
    // Por defecto, la primera (horario de verano); con el selector, la segunda.
    expect(instanteDeCampo({ pared, ocurrencia: 'primera' })).toEqual({ ok: true, instante: instante(primera), ambigua: true });
    expect(instanteDeCampo({ pared, ocurrencia: 'segunda' })).toEqual({ ok: true, instante: instante(segunda), ambigua: true });
  });

  it('muestra las horas de la API en Santiago; en la hora repetida agrega el desfase', () => {
    expect(formatearFechaHora('2026-07-15T14:00:00Z')).toBe('mié 15-07-2026 10:00');
    expect(formatearFechaHora('2026-04-05T02:30:00Z')).toBe('sáb 04-04-2026 23:30 (UTC−3)');
    expect(formatearFechaHora('2026-04-05T03:30:00Z')).toBe('sáb 04-04-2026 23:30 (UTC−4)');
    expect(formatearFechaHora('2026-09-06T04:00:00Z')).toBe('dom 06-09-2026 01:00');
  });

  it('al editar, el valor inicial conserva cuál de las dos ocurrencias era', () => {
    expect(campoDeInstante('2026-04-05T02:30:00Z')).toEqual({ pared: '2026-04-04T23:30', ocurrencia: 'primera' });
    expect(campoDeInstante('2026-04-05T03:30:00Z')).toEqual({ pared: '2026-04-04T23:30', ocurrencia: 'segunda' });
    expect(campoDeInstante('2026-07-15T14:00:00Z')).toEqual({ pared: '2026-07-15T10:00', ocurrencia: 'primera' });
  });

  it('«hoy» es el día en Santiago, no en la zona del navegador', () => {
    // 02:30 UTC del 30-10 son las 23:30 del 29-10 en Santiago (UTC−3).
    expect(hoy(instante('2026-10-30T02:30:00Z'))).toBe('2026-10-29');
    expect(hoy(instante('2026-10-30T03:00:00Z'))).toBe('2026-10-30');
  });

  it('el inicio del día en Santiago; el día del salto empieza a la 01:00', () => {
    expect(inicioDelDia('2026-10-30')).toBe(instante('2026-10-30T03:00:00Z'));
    expect(inicioDelDia('2026-07-15')).toBe(instante('2026-07-15T04:00:00Z'));
    expect(inicioDelDia('2026-09-06')).toBe(instante('2026-09-06T04:00:00Z'));
    expect(formatearFechaHora(new Date(inicioDelDia('2026-09-06')).toISOString())).toBe('dom 06-09-2026 01:00');
    expect(inicioDelDia('2026-04-05')).toBe(instante('2026-04-05T04:00:00Z'));
  });

  it('ida y vuelta en todo 2026 (cada 30 min): pared → instante devuelve el mismo instante, o la primera ocurrencia', () => {
    const fallos: string[] = [];
    let ambiguas = 0;
    for (let t = instante('2026-01-01T00:00:00Z'); t < instante('2027-01-01T00:00:00Z'); t += 30 * 60_000) {
      const r = resolver(paredDe(t));
      if (r.tipo === 'unica' && r.instante === t) continue;
      if (r.tipo === 'ambigua' && (r.primera === t || r.segunda === t)) {
        ambiguas++;
        continue;
      }
      fallos.push(new Date(t).toISOString());
    }
    expect(fallos).toEqual([]);
    // La hora repetida de abril: 23:00 y 23:30, dos veces cada una.
    expect(ambiguas).toBe(4);
  });
});

describe('lectura del campo', () => {
  it.each(['', '2026-09-06', '2026-09-06 10:00', '2026-02-30T10:00', '2026-04-31T10:00', '2026-01-01T24:00', 'x'])(
    '«%s» no es válido',
    (texto) => {
      expect(leerPared(texto)).toBeNull();
      expect(instanteDeCampo({ pared: texto, ocurrencia: 'primera' })).toMatchObject({ ok: false, motivo: 'formato' });
    },
  );

  it('acepta los segundos en cero que algunos navegadores agregan', () => {
    expect(leerPared('2026-07-15T10:00:00')).toEqual({ anio: 2026, mes: 7, dia: 15, hora: 10, minuto: 0 });
    expect(escribirPared(leerPared('2028-02-29T08:05')!)).toBe('2028-02-29T08:05');
  });

  it('sin repetición no hay ocurrencias que elegir', () => {
    expect(ocurrencias('2026-07-15T10:00')).toBeNull();
    expect(ocurrencias('no')).toBeNull();
  });

  it('el desfase ignora los milisegundos del instante', () => {
    expect(desfase(instante('2026-07-15T14:00:00.999Z'))).toBe(-4 * 3_600_000);
  });

  it('formatos para mostrar filtros', () => {
    expect(formatearFecha('2026-04-04')).toBe('04-04-2026');
    expect(formatearPared('2026-04-04T23:30')).toBe('04-04-2026 23:30');
    expect(formatearPared('x')).toBe('x');
    expect(() => inicioDelDia('2026-13-01')).toThrow();
  });

  it('el salto de 2027 también se calcula, sin fechas fijas en el código', () => {
    expect(mensajeInexistente(leerPared('2027-09-05T00:15')!)).toContain('(de 00:00 a 00:59 del 05-09-2027)');
  });
});
