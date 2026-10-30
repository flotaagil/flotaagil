import { afterEach, describe, expect, it, vi } from 'vitest';
import { entornoDelNavegador } from './entorno';

describe('entorno del navegador', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('usa Web Locks solo en contexto seguro y si el navegador la tiene', async () => {
    const request = vi.fn((_nombre: string, tarea: () => Promise<number>) => tarea());
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    const seguro = entornoDelNavegador();
    expect(await seguro.locks!.request('flotaagil-sesion', async () => 7)).toBe(7);
    expect(request).toHaveBeenCalledOnce();

    vi.stubGlobal('isSecureContext', false);
    expect(entornoDelNavegador().locks).toBeNull();
  });

  it('sin Web Locks en el navegador no hay locks aunque el contexto sea seguro', () => {
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { userAgent: 'sin-locks' });
    expect(entornoDelNavegador().locks).toBeNull();
  });

  it('localStorage disponible o null si el navegador lo bloquea', () => {
    expect(entornoDelNavegador().almacen).toBe(window.localStorage);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Bloqueado', 'SecurityError');
    });
    expect(entornoDelNavegador().almacen).toBeNull();
  });

  it('BroadcastChannel entre dos pestañas y null si no existe', async () => {
    const a = entornoDelNavegador().crearCanal()!;
    const b = entornoDelNavegador().crearCanal()!;
    const recibido = new Promise((resolver) => b.alRecibir(resolver));
    a.enviar({ tipo: 'logout', pendiente: true });
    expect(await recibido).toEqual({ tipo: 'logout', pendiente: true });
    a.cerrar();
    b.cerrar();
    vi.stubGlobal('BroadcastChannel', undefined);
    expect(entornoDelNavegador().crearCanal()).toBeNull();
  });

  it('origen, fetch, espera, azar y el evento online', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    const entorno = entornoDelNavegador();
    expect(entorno.origen).toBe(window.location.origin);
    expect((await entorno.fetch('/api/salud/')).status).toBe(204);
    expect(fetch).toHaveBeenCalledWith('/api/salud/', undefined);
    vi.useFakeTimers();
    const espera = entorno.esperar(450);
    vi.advanceTimersByTime(450);
    await espera;
    vi.useRealTimers();
    expect(entorno.azar()).toBeGreaterThanOrEqual(0);
    const oyente = vi.fn();
    const quitar = entorno.alVolverLaConexion(oyente);
    window.dispatchEvent(new Event('online'));
    quitar();
    window.dispatchEvent(new Event('online'));
    expect(oyente).toHaveBeenCalledOnce();
  });
});
