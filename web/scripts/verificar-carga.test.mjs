import { describe, expect, it } from 'vitest';
import { cierreEstatico, DIFERIDOS, verificar } from './verificar-carga.mjs';

/** Informe mínimo de un build correcto: cada módulo diferido en su chunk; lo vigilado, solo en esos chunks. */
function informeCorrecto() {
  const diferidos = DIFERIDOS.map((fachada, i) => ({
    archivo: `assets/d${i}.js`,
    entrada: false,
    dinamico: true,
    fachada,
    modulos: [fachada],
    imports: ['assets/index.js'],
  }));
  return {
    chunks: [
      { archivo: 'assets/index.js', entrada: true, dinamico: false, fachada: 'index.html', modulos: ['src/main.tsx', 'src/App.tsx'], imports: ['assets/compartido.js'] },
      { archivo: 'assets/compartido.js', entrada: false, dinamico: false, fachada: null, modulos: ['src/componentes/Aviso.tsx'], imports: [] },
      ...diferidos,
    ],
  };
}

const chunkDe = (informe, fachada) => informe.chunks.find((c) => c.fachada === fachada);

describe('verificar-carga', () => {
  it('un build correcto pasa', () => {
    expect(verificar(informeCorrecto())).toEqual([]);
  });

  it('sigue los imports estáticos, no los dinámicos', () => {
    expect(cierreEstatico(informeCorrecto().chunks, 'assets/index.js')).toEqual([
      'src/main.tsx',
      'src/App.tsx',
      'src/componentes/Aviso.tsx',
    ]);
  });

  it('falla si la sesión llega al paquete inicial a través de un chunk compartido', () => {
    const informe = informeCorrecto();
    informe.chunks[1].modulos.push('src/sesion/SesionProvider.tsx');
    expect(verificar(informe)).toEqual([
      'paquete inicial carga módulos prohibidos: src/sesion/SesionProvider.tsx.',
      'página no encontrada carga módulos prohibidos: src/sesion/SesionProvider.tsx.',
    ]);
  });

  it.each([
    'src/api/cliente.ts',
    'src/api/auth.ts',
    'src/componentes/Layout.tsx',
    'src/rutas/RutaAutenticada.tsx',
    'src/paginas/Login.tsx',
    'src/reservas/api.ts',
  ])('falla si la página no encontrada (sin sesión) carga %s', (modulo) => {
    const informe = informeCorrecto();
    chunkDe(informe, 'src/paginas/NoEncontrada.tsx').modulos.push(modulo);
    expect(verificar(informe)).toEqual([`página no encontrada carga módulos prohibidos: ${modulo}.`]);
  });

  it('el login puede cargar la sesión, pero no reservas', () => {
    const informe = informeCorrecto();
    const login = chunkDe(informe, 'src/paginas/Login.tsx');
    login.modulos.push('src/sesion/sesion.ts');
    expect(verificar(informe)).toEqual([]);
    login.modulos.push('src/reservas/etiquetas.ts');
    expect(verificar(informe)).toEqual(['login carga módulos prohibidos: src/reservas/etiquetas.ts.']);
  });

  it('falla si un módulo no se carga con lazy', () => {
    const informe = informeCorrecto();
    informe.chunks = informe.chunks.filter((c) => c.fachada !== 'src/componentes/Layout.tsx');
    expect(verificar(informe)).toEqual([
      'src/componentes/Layout.tsx no se carga con lazy (no es la entrada de un chunk dinámico).',
    ]);
  });

  it('falla si lo vigilado no está en el build (no estaría revisando nada) o si hay más de una entrada', () => {
    const informe = {
      chunks: [
        { archivo: 'a.js', entrada: true, dinamico: false, fachada: null, modulos: [], imports: [] },
        { archivo: 'b.js', entrada: true, dinamico: false, fachada: null, modulos: [], imports: [] },
      ],
    };
    const problemas = verificar(informe, { diferidos: [] });
    expect(problemas).toEqual([
      'Se esperaba un solo chunk de entrada y hay 2.',
      'No hay módulos de src/sesion/ en el build: la verificación no estaría revisando nada.',
      'No hay módulos de src/reservas/ en el build: la verificación no estaría revisando nada.',
    ]);
  });
});
