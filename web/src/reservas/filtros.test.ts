import { describe, expect, it } from 'vitest';
import { cambiarFiltros, consultaDeFiltros, escribirFiltros, hayFiltros, leerFiltros, SIN_FILTROS } from './filtros';

const leer = (query: string) => leerFiltros(new URLSearchParams(query));
const escribir = (query: string) => escribirFiltros(leer(query)).toString();
// 30-10-2026 15:00 en Santiago (UTC−3).
const AHORA = Date.parse('2026-10-30T18:00:00Z');

describe('filtros en la URL', () => {
  it('sin parámetros: vista por defecto «desde hoy 00:00» (hoy en Santiago)', () => {
    const f = leer('');
    expect(f).toEqual({ ...SIN_FILTROS, desdeHoy: true });
    expect(consultaDeFiltros(f, AHORA).consulta).toEqual({ desde: '2026-10-30T03:00:00.000Z' });
    // A las 23:30 del 29 en Santiago (02:30 UTC del 30), «hoy» sigue siendo el 29.
    expect(consultaDeFiltros(f, Date.parse('2026-10-30T02:30:00Z')).consulta).toEqual({ desde: '2026-10-29T03:00:00.000Z' });
    expect(escribir('')).toBe('');
  });

  it('quitar la vista por defecto deja `desde=` en la URL (y no vuelve al recargar)', () => {
    const sinDefecto = cambiarFiltros(leer(''), { desdeHoy: false });
    const url = escribirFiltros(sinDefecto).toString();
    expect(url).toBe('desde=');
    expect(leer(url).desdeHoy).toBe(false);
    expect(consultaDeFiltros(leer(url), AHORA).consulta).toEqual({});
  });

  it('una fecha, un desde o un hasta reemplazan la vista por defecto', () => {
    expect(leer('fecha=2026-10-29').desdeHoy).toBe(false);
    expect(leer('hasta=2026-10-29T10:00').desdeHoy).toBe(false);
    expect(cambiarFiltros(leer(''), { fecha: '2026-11-01' })).toMatchObject({ desdeHoy: false, fecha: '2026-11-01' });
    expect(escribirFiltros(cambiarFiltros(leer(''), { fecha: '2026-11-01' })).toString()).toBe('fecha=2026-11-01');
  });

  it('normaliza: estados en orden fijo sin repetir, valores inválidos fuera, página por defecto omitida', () => {
    expect(escribir('estado=SOLICITADO&estado=PENDIENTE_CONFIRMACION&estado=SOLICITADO&estado=NO&desde=')).toBe(
      'estado=PENDIENTE_CONFIRMACION&estado=SOLICITADO&desde=',
    );
    expect(leer('sentido=OTRO&canal=FAX&ordenar=x&page=-3&fecha=2026-02-30&desde=ayer')).toMatchObject({
      sentido: null,
      canal: null,
      ordenar: null,
      pagina: 1,
      fecha: null,
      desde: null,
    });
    expect(escribir('page=1&desde=')).toBe('desde=');
    expect(escribir('page=3&desde=')).toBe('desde=&page=3');
  });

  it('ida y vuelta de todos los filtros, en un orden de parámetros fijo', () => {
    const url =
      'estado=PENDIENTE_CONFIRMACION&estado=CANCELADO&fecha=2026-10-30&desde=2026-10-30T08%3A00&hasta=2026-10-30T20%3A00' +
      '&sentido=DESDE_AEROPUERTO&canal=WHATSAPP&q=p%C3%ADa&ordenar=-creado_en&page=2';
    expect(escribir(url)).toBe(url);
  });

  it('cambiar un filtro vuelve a la primera página; cambiar la página no', () => {
    const f = leer('page=4&desde=');
    expect(cambiarFiltros(f, { sentido: 'URBANO' }).pagina).toBe(1);
    expect(cambiarFiltros(f, { pagina: 5 }).pagina).toBe(5);
  });
});

describe('consulta para la API', () => {
  it('convierte desde y hasta (hora de Santiago) a instantes UTC; arma el resto tal cual', () => {
    const f = leer('estado=SOLICITADO&fecha=2026-10-30&desde=2026-07-15T10:00&hasta=2026-07-15T12:30&sentido=URBANO&canal=WEB&q=%20p%C3%ADa%20&ordenar=-recogida_en&page=2');
    expect(consultaDeFiltros(f, AHORA)).toEqual({
      consulta: {
        estado: ['SOLICITADO'],
        fecha: '2026-10-30',
        desde: '2026-07-15T14:00:00.000Z',
        hasta: '2026-07-15T16:30:00.000Z',
        sentido: 'URBANO',
        canal: 'WEB',
        q: 'pía',
        ordenar: ['-recogida_en'],
        page: 2,
      },
      errores: {},
    });
  });

  it('hora repetida: `desde` toma la primera ocurrencia y `hasta` la segunda (rango más amplio)', () => {
    const { consulta } = consultaDeFiltros(leer('desde=2026-04-04T23:30&hasta=2026-04-04T23:30'), AHORA);
    expect(consulta).toEqual({ desde: '2026-04-05T02:30:00.000Z', hasta: '2026-04-05T03:30:00.000Z' });
  });

  it('hora inexistente: el filtro no se aplica y queda el error', () => {
    const { consulta, errores } = consultaDeFiltros(leer('desde=2026-09-06T00:30&hasta=2026-09-06T00:10'), AHORA);
    expect(consulta).toEqual({});
    expect(errores.desde).toContain('no existe');
    expect(errores.hasta).toContain('Elige 01:00 o después');
  });

  it('el día del salto de septiembre, «hoy 00:00» es la 01:00', () => {
    expect(consultaDeFiltros(leer(''), Date.parse('2026-09-06T15:00:00Z')).consulta).toEqual({ desde: '2026-09-06T04:00:00.000Z' });
  });

  it('hayFiltros: la vista por defecto cuenta; el orden y la página no', () => {
    expect(hayFiltros(leer(''))).toBe(true);
    expect(hayFiltros(leer('desde=&ordenar=creado_en&page=2'))).toBe(false);
    expect(hayFiltros(leer('desde=&q=%20'))).toBe(false);
    expect(hayFiltros(leer('desde=&canal=WEB'))).toBe(true);
  });
});
