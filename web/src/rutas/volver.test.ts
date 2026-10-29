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
    const conReservas = crearRutas([
      { index: true, element: null },
      { path: 'reservas/:id', element: null },
    ]);
    expect(destinoSeguro('/reservas/42?ver=historial', conReservas, ORIGEN)).toBe('/reservas/42?ver=historial');
    expect(destinoSeguro('/reservas/42', rutas, ORIGEN)).toBe(INICIO);
    expect(destinoSeguro('/reservas', conReservas, ORIGEN)).toBe(INICIO);
  });
});
