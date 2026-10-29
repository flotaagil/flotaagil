/**
 * Dos pestañas con la misma cookie renuevan a la vez. El servidor falso procesa en orden de llegada y la
 * prueba decide cuándo se entrega cada respuesta (`retener` / `entregar`), y cuándo termina la espera del
 * plan B (`reloj.avanzar`): el orden es determinista, sin depender del tiempo.
 */

import { describe, expect, it } from 'vitest';
import { MENSAJES } from '../api/errores';
import { crearEntorno, crearLocks, crearReloj, vaciar } from '../pruebas/entornoFalso';
import { ServidorAuthFalso } from '../pruebas/servidorAuthFalso';
import type { Locks } from './entorno';
import { crearSesionConectada as crearSesion } from '../pruebas/sesionConectada';
import type { Sesion } from './sesion';

const REFRESH = 'POST /api/auth/refresh/';

async function dosPestanas(locks: Locks | null) {
  const servidor = new ServidorAuthFalso();
  const reloj = crearReloj();
  const a = crearSesion(crearEntorno({ servidor, locks, reloj }).entorno);
  const b = crearSesion(crearEntorno({ servidor, locks, reloj }).entorno);
  await a.login('despacho@andes.example', 'clave');
  await b.iniciar(); // B abre el panel: refresh silencioso con la misma cookie
  expect([a.estado().fase, b.estado().fase]).toEqual(['autenticada', 'autenticada']);
  servidor.vencerAccess();
  servidor.llamadas = [];
  return { servidor, reloj, a, b };
}

function autenticada(sesion: Sesion) {
  return sesion.estado().fase === 'autenticada' && sesion.access() !== null;
}

describe('con Web Locks', () => {
  it('las renovaciones van en serie: la segunda usa la cookie que dejó la primera y ninguna recibe 401', async () => {
    const { servidor, a, b } = await dosPestanas(crearLocks());
    servidor.retener(REFRESH);
    const cookieInicial = servidor.frasco.refresh;

    const renovacionA = a.renovarTrasRechazo();
    const renovacionB = b.renovarTrasRechazo();
    await vaciar();
    // B espera el lock: solo hay un refresh en vuelo.
    expect(servidor.cuenta(REFRESH)).toBe(1);

    servidor.entregar(); // respuesta de A: la cookie rota
    await vaciar();
    const cookieDeA = servidor.frasco.refresh;
    expect(cookieDeA).not.toBe(cookieInicial);
    expect(servidor.cuenta(REFRESH)).toBe(2); // ahora B, con la cookie de A

    servidor.entregar();
    expect(await renovacionA).toMatch(/^A/);
    expect(await renovacionB).toMatch(/^A/);
    expect(servidor.frasco.refresh).not.toBe(cookieDeA);
    expect(autenticada(a) && autenticada(b)).toBe(true);
  });
});

describe('sin Web Locks (plan B)', () => {
  it.each([
    ['primero la respuesta de A', [0, 0]],
    ['primero el 401 de B', [1, 0]],
  ])('4a: la cookie ya se actualizó cuando B reintenta (%s)', async (_, orden) => {
    const { servidor, reloj, a, b } = await dosPestanas(null);
    servidor.retener(REFRESH);

    const renovacionA = a.renovarTrasRechazo();
    const renovacionB = b.renovarTrasRechazo();
    await vaciar();
    expect(servidor.cuenta(REFRESH)).toBe(2); // las dos con la misma cookie: A gana, B recibe 401

    for (const indice of orden) servidor.entregar(indice);
    await vaciar();
    // B esperando al azar entre 300 y 600 ms (azar = 0,5 → 450 ms).
    expect(reloj.esperas.map((e) => e.ms)).toEqual([450]);
    reloj.avanzar();
    await vaciar();
    expect(servidor.cuenta(REFRESH)).toBe(3); // el único reintento de B, ya con la cookie de A
    servidor.entregar();

    expect(await renovacionA).toMatch(/^A/);
    expect(await renovacionB).toMatch(/^A/);
    expect(autenticada(a) && autenticada(b)).toBe(true);
    expect(reloj.esperas).toHaveLength(0);
  });

  it('4b: la cookie todavía no se actualizó cuando B reintenta → B queda anónima sin más reintentos', async () => {
    const { servidor, reloj, a, b } = await dosPestanas(null);
    servidor.retener(REFRESH);
    const cookieInicial = servidor.frasco.refresh;

    const renovacionA = a.renovarTrasRechazo();
    const renovacionB = b.renovarTrasRechazo();
    await vaciar();
    servidor.entregar(1); // llega el 401 de B; la respuesta de A sigue en camino
    await vaciar();
    expect(servidor.frasco.refresh).toBe(cookieInicial); // el 401 no tocó la cookie
    reloj.avanzar();
    await vaciar();
    expect(servidor.cuenta(REFRESH)).toBe(3);
    servidor.entregar(1); // el reintento de B, todavía con la cookie vieja → 401

    expect(await renovacionB).toBeNull();
    expect(b.estado()).toEqual({ fase: 'anonima', aviso: MENSAJES.sesion_terminada });
    expect(b.access()).toBeNull();

    servidor.entregar(0); // por fin llega la respuesta de A
    expect(await renovacionA).toMatch(/^A/);
    expect(autenticada(a)).toBe(true);

    // Sin bucles: B no volvió a intentar ni quedó esperando.
    await vaciar();
    expect(servidor.cuenta(REFRESH)).toBe(3);
    expect(reloj.esperas).toHaveLength(0);
    expect(await b.renovarTrasRechazo()).toBeNull();
    expect(servidor.cuenta(REFRESH)).toBe(3);

    // La sesión sigue viva para quien recargue: la cookie quedó en la de A.
    servidor.soltar(REFRESH);
    const recargada = crearSesion(crearEntorno({ servidor }).entorno);
    await recargada.iniciar();
    expect(recargada.estado().fase).toBe('autenticada');
  });

  it('si el reintento falla, todas las peticiones que esperaban la renovación fallan (no se dan por resueltas)', async () => {
    const { servidor, reloj, b } = await dosPestanas(null);
    servidor.expirarSesion();
    const esperando = [b.renovarTrasRechazo(), b.renovarTrasRechazo(), b.renovarTrasRechazo()];
    await vaciar();
    reloj.avanzar();
    expect(await Promise.all(esperando)).toEqual([null, null, null]);
    expect(servidor.cuenta(REFRESH)).toBe(2); // una renovación compartida + su único reintento
    expect(b.estado()).toEqual({ fase: 'anonima', aviso: MENSAJES.sesion_terminada });
  });
});

describe('logout entre pestañas', () => {
  it('el logout espera el lock: no sale mientras otra pestaña está renovando', async () => {
    const locks = crearLocks();
    const { servidor, a, b } = await dosPestanas(locks);
    servidor.retener(REFRESH);
    const renovacionA = a.renovarTrasRechazo();
    await vaciar();
    const logoutB = b.logout();
    await vaciar();
    expect(servidor.cuenta('POST /api/auth/logout/')).toBe(0);
    servidor.entregar();
    await renovacionA;
    expect(await logoutB).toEqual({ confirmado: true });
    // El logout envió la cookie ya rotada por A: el servidor invalidó la vigente y la borró.
    expect(servidor.frasco.refresh).toBeNull();
  });
});
