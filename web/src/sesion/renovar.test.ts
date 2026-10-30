import { describe, expect, it } from 'vitest';
import { crearEntorno, crearLocks, crearReloj, vaciar } from '../pruebas/entornoFalso';
import { ServidorAuthFalso } from '../pruebas/servidorAuthFalso';
import { crearMarca } from './marca';
import { crearRenovador, ESPERA_MAXIMA_MS, ESPERA_MINIMA_MS } from './renovar';

const REFRESH = 'POST /api/auth/refresh/';

function preparar(opciones: { locks?: boolean; azar?: number } = {}) {
  const servidor = new ServidorAuthFalso();
  const reloj = crearReloj();
  const { entorno } = crearEntorno({
    servidor,
    reloj,
    locks: opciones.locks ? crearLocks() : null,
    azar: opciones.azar ?? 0.5,
  });
  const marca = crearMarca(entorno.almacen);
  return { servidor, reloj, marca, renovar: crearRenovador(entorno, marca) };
}

describe('renovador', () => {
  it('rota la cookie y devuelve el access nuevo', async () => {
    const { servidor, renovar } = preparar({ locks: true });
    const cookie = servidor.sembrarSesion();
    expect(await renovar()).toEqual({ tipo: 'ok', access: expect.stringMatching(/^A/) });
    expect(servidor.frasco.refresh).not.toBe(cookie);
  });

  it('las llamadas simultáneas de una pestaña comparten una sola operación', async () => {
    const { servidor, renovar } = preparar({ locks: true });
    servidor.sembrarSesion();
    const [uno, dos] = await Promise.all([renovar(), renovar()]);
    expect(uno).toBe(dos);
    expect(servidor.cuenta(REFRESH)).toBe(1);
    // Terminada la operación, la siguiente es nueva.
    await renovar();
    expect(servidor.cuenta(REFRESH)).toBe(2);
  });

  it('con la marca de logout pendiente no pide nada', async () => {
    const { servidor, renovar, marca } = preparar({ locks: true });
    servidor.sembrarSesion();
    marca.poner();
    expect(await renovar()).toEqual({ tipo: 'sin_sesion', motivo: 'logout_pendiente' });
    expect(servidor.cuenta(REFRESH)).toBe(0);
  });

  it('distingue sesion_expirada de sesion_invalida', async () => {
    const { servidor, renovar } = preparar({ locks: true });
    expect(await renovar()).toEqual({ tipo: 'sin_sesion', motivo: 'sesion_invalida' });
    servidor.sembrarSesion();
    servidor.expirarSesion();
    expect(await renovar()).toEqual({ tipo: 'sin_sesion', motivo: 'sesion_expirada' });
  });

  it.each([
    [0, ESPERA_MINIMA_MS],
    [0.5, 450],
    [0.9999, ESPERA_MAXIMA_MS],
  ])('plan B: con azar %s espera %s ms y reintenta una sola vez', async (azar, ms) => {
    const { servidor, reloj, renovar } = preparar({ azar });
    const resultado = renovar();
    await vaciar();
    expect(reloj.avanzar()).toBe(ms);
    expect(await resultado).toEqual({ tipo: 'sin_sesion', motivo: 'sesion_invalida' });
    expect(servidor.cuenta(REFRESH)).toBe(2);
    expect(reloj.esperas).toHaveLength(0);
  });

  it('plan B: si la marca aparece durante la espera no reintenta', async () => {
    const { servidor, reloj, renovar, marca } = preparar();
    const resultado = renovar();
    await vaciar();
    marca.poner();
    reloj.avanzar();
    expect(await resultado).toEqual({ tipo: 'sin_sesion', motivo: 'logout_pendiente' });
    expect(servidor.cuenta(REFRESH)).toBe(1);
  });

  it('plan B: origen_no_permitido no se reintenta', async () => {
    const { servidor, reloj, renovar } = preparar();
    servidor.rechazarOrigen = true;
    expect(await renovar()).toEqual({ tipo: 'sin_sesion', motivo: 'origen_no_permitido' });
    expect(reloj.esperas).toHaveLength(0);
  });

  it.each([
    [500, 'servidor'],
    [502, 'red'],
    [503, 'red'],
    [504, 'red'],
  ])('un %s no es «sin sesión»: es un error (%s)', async (estado, motivo) => {
    const { servidor, renovar } = preparar({ locks: true });
    servidor.sembrarSesion();
    servidor.fallar(REFRESH, estado);
    expect(await renovar()).toEqual({ tipo: 'error', motivo });
  });

  it('una falla de red es un error de red', async () => {
    const { servidor, renovar } = preparar({ locks: true });
    servidor.fallar(REFRESH, 'red');
    expect(await renovar()).toEqual({ tipo: 'error', motivo: 'red' });
  });
});
