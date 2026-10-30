import { describe, expect, it } from 'vitest';
import { cierreEstatico, PANTALLAS_DIFERIDAS, verificar } from './verificar-carga.mjs';

/** Informe mínimo de un build correcto: cada pantalla en su chunk; reservas solo en chunks dinámicos. */
function informeCorrecto() {
  const pantallas = PANTALLAS_DIFERIDAS.map((fachada, i) => ({
    archivo: `assets/p${i}.js`,
    entrada: false,
    dinamico: true,
    fachada,
    modulos: [fachada],
    imports: ['assets/index.js'],
  }));
  return {
    chunks: [
      { archivo: 'assets/index.js', entrada: true, dinamico: false, fachada: 'index.html', modulos: ['src/main.tsx', 'src/sesion/sesion.ts'], imports: ['assets/compartido.js'] },
      { archivo: 'assets/compartido.js', entrada: false, dinamico: false, fachada: null, modulos: ['src/componentes/Aviso.tsx'], imports: [] },
      ...pantallas,
    ],
  };
}

describe('verificar-carga', () => {
  it('un build correcto pasa', () => {
    expect(verificar(informeCorrecto())).toEqual([]);
  });

  it('sigue los imports estáticos, no los dinámicos', () => {
    const informe = informeCorrecto();
    expect(cierreEstatico(informe.chunks, 'assets/index.js')).toEqual(['src/main.tsx', 'src/sesion/sesion.ts', 'src/componentes/Aviso.tsx']);
  });

  it('falla si un módulo de reservas llega al paquete inicial a través de un chunk compartido', () => {
    const informe = informeCorrecto();
    informe.chunks[1].modulos.push('src/reservas/api.ts');
    expect(verificar(informe)).toEqual([
      'paquete inicial carga módulos de reservas: src/reservas/api.ts.',
      'src/paginas/Login.tsx carga módulos de reservas: src/reservas/api.ts.',
      'src/paginas/NoEncontrada.tsx carga módulos de reservas: src/reservas/api.ts.',
    ]);
  });

  it('falla si el login importa algo de reservas', () => {
    const informe = informeCorrecto();
    const login = informe.chunks.find((c) => c.fachada === 'src/paginas/Login.tsx');
    login.modulos.push('src/reservas/etiquetas.ts');
    expect(verificar(informe)).toEqual(['src/paginas/Login.tsx carga módulos de reservas: src/reservas/etiquetas.ts.']);
  });

  it('falla si una pantalla no se carga con lazy', () => {
    const informe = informeCorrecto();
    informe.chunks = informe.chunks.filter((c) => c.fachada !== 'src/reservas/paginas/Editar.tsx');
    expect(verificar(informe)).toEqual([
      'src/reservas/paginas/Editar.tsx no se carga con lazy (no es la entrada de un chunk dinámico).',
    ]);
  });

  it('falla si no hay módulos de reservas (no estaría revisando nada) o si hay más de una entrada', () => {
    const informe = {
      chunks: [
        { archivo: 'a.js', entrada: true, dinamico: false, fachada: null, modulos: [], imports: [] },
        { archivo: 'b.js', entrada: true, dinamico: false, fachada: null, modulos: [], imports: [] },
      ],
    };
    const problemas = verificar(informe);
    expect(problemas[0]).toBe('Se esperaba un solo chunk de entrada y hay 2.');
    expect(problemas.at(-1)).toBe('No hay módulos de src/reservas/ en el build: la verificación no estaría revisando nada.');
  });
});
