import { describe, expect, it } from 'vitest';
import { leerCodigo, MENSAJES, mensajeDeError } from './errores';

describe('mensajes de error', () => {
  it.each([
    ['sesion_invalida', 401, MENSAJES.sesion_terminada],
    ['sesion_expirada', 401, MENSAJES.sesion_terminada],
    ['origen_no_permitido', 403, MENSAJES.origen_no_permitido],
    ['rol_no_permitido', 403, MENSAJES.rol_no_permitido],
    ['cuenta_bloqueada', 401, MENSAJES.cuenta_bloqueada],
    ['throttled', 429, MENSAJES.throttled],
    [null, 429, MENSAJES.throttled],
    ['codigo_desconocido', 500, MENSAJES.inesperado],
    [null, 500, MENSAJES.inesperado],
  ])('%s (%s)', (codigo, estado, mensaje) => {
    expect(mensajeDeError(codigo, estado)).toBe(mensaje);
  });

  it('lee el código del cuerpo y tolera cuerpos vacíos o sin code', async () => {
    expect(await leerCodigo(new Response('{"detail":"x","code":"cuenta_bloqueada"}'))).toBe('cuenta_bloqueada');
    expect(await leerCodigo(new Response('{"detail":"x"}'))).toBeNull();
    expect(await leerCodigo(new Response('no es json'))).toBeNull();
    expect(await leerCodigo(new Response(null, { status: 502 }))).toBeNull();
  });
});
