import { describe, expect, it } from 'vitest';
import { ORIGEN } from '../pruebas/entornoFalso';
import { crearRutas } from './tabla';
import { destinoSeguro, INICIO } from './volver';

const rutas = crearRutas();

describe('destino de `volver`', () => {
  it.each([
    ['https://evil.example'],
    ['https://evil.example/'],
    ['//evil.example'],
    ['/\\evil.example'],
    ['\\\\evil.example'],
    ['\\/evil.example'],
    ['javascript:alert(1)'],
    ['JaVaScRiPt:alert(1)'],
    ['%2F%2Fevil.example'],
    ['/%2F%2Fevil.example'],
    ['http://localhost:3000.evil.example/'],
    ['/no-existe'],
    ['/login'],
    ['/login?volver=/'],
    [''],
    [null],
  ])('%s → Inicio', (volver) => {
    expect(destinoSeguro(volver, rutas, ORIGEN)).toBe(INICIO);
  });

  it('ruta interna válida: conserva pathname, search y hash', () => {
    expect(destinoSeguro('/?pestaña=2#arriba', rutas, ORIGEN)).toBe('/?pesta%C3%B1a=2#arriba');
    expect(destinoSeguro(`${ORIGEN}/?x=1`, rutas, ORIGEN)).toBe('/?x=1');
  });

  it('las pantallas nuevas quedan cubiertas por la tabla de rutas, sin listas a mano', () => {
    const conOtra = crearRutas([
      { index: true, element: null },
      { path: 'otra/:id', element: null },
    ]);
    expect(destinoSeguro('/otra/42?ver=historial', conOtra, ORIGEN)).toBe('/otra/42?ver=historial');
    expect(destinoSeguro('/otra/42', rutas, ORIGEN)).toBe(INICIO);
    expect(destinoSeguro('/otra', conOtra, ORIGEN)).toBe(INICIO);
  });

  it('las rutas de reservas son destinos válidos', () => {
    expect(destinoSeguro('/reservas?estado=SOLICITADO&desde=', rutas, ORIGEN)).toBe('/reservas?estado=SOLICITADO&desde=');
    expect(destinoSeguro('/reservas/42?x=1#h', rutas, ORIGEN)).toBe('/reservas/42?x=1#h');
    expect(destinoSeguro('/reservas/42/editar', rutas, ORIGEN)).toBe('/reservas/42/editar');
    expect(destinoSeguro('/reservas/nueva', rutas, ORIGEN)).toBe('/reservas/nueva');
    expect(destinoSeguro('/reservas/42/otra', rutas, ORIGEN)).toBe(INICIO);
  });
});
