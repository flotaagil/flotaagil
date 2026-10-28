import { Device } from '@capacitor/device';
import { guardarEstado, guardarEvento, guardarMuestra, leerEstado } from './almacen';
import { bytesEstimados, debeRegistrar } from './muestreo';
import { abrirAjustes, detenerRastreo, iniciarRastreo, type CallbackError, type Location } from './rastreo';
import { INTERVALO_OBJETIVO_S, type Modo, type Muestra, type TipoEvento } from './tipos';

/** Build de diagnóstico (VITE_DIAGNOSTICO=1): registra en consola cada entrega del plugin. */
const DIAGNOSTICO = import.meta.env.VITE_DIAGNOSTICO === '1';

export interface EstadoVivo {
  sesion: string | null;
  modo: Modo;
  muestras: Muestra[];
  callbacks_total: number;
  error: string | null;
}

type Oyente = (estado: EstadoVivo) => void;

function idSesion(fecha = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `S${fecha.getFullYear()}${dos(fecha.getMonth() + 1)}${dos(fecha.getDate())}-`
    + `${dos(fecha.getHours())}${dos(fecha.getMinutes())}${dos(fecha.getSeconds())}`;
}

/** Controla una sesión de medición: rastreo, muestreo, persistencia y eventos. */
export class Sesion {
  private watcher: string | null = null;
  private segundoPlano = false;
  private callbacksPendientes = 0;
  private ultimaMs: number | null = null;
  private estado: EstadoVivo = { sesion: null, modo: 'espera', muestras: [], callbacks_total: 0, error: null };
  private oyentes = new Set<Oyente>();

  suscribir(oyente: Oyente): () => void {
    this.oyentes.add(oyente);
    oyente(this.estado);
    return () => this.oyentes.delete(oyente);
  }

  private publicar(cambios: Partial<EstadoVivo>) {
    this.estado = { ...this.estado, ...cambios };
    this.oyentes.forEach((o) => o(this.estado));
  }

  private evento(tipo: TipoEvento, detalle = '', sesion = this.estado.sesion) {
    if (!sesion) return Promise.resolve();
    const ahora = new Date();
    return guardarEvento({ sesion, recibido_iso: ahora.toISOString(), recibido_ms: ahora.getTime(), tipo, detalle });
  }

  /** Al abrir la app: si quedó una sesión activa, la app se cerró o la mató el sistema sin detenerla. */
  async revisarInterrumpida(): Promise<string | null> {
    const pendiente = await leerEstado();
    if (!pendiente) return null;
    const ultima = pendiente.ultima_muestra_ms;
    const detalle = ultima
      ? `última muestra ${new Date(ultima).toISOString()}, ${Math.round((Date.now() - ultima) / 1000)} s antes de reabrir`
      : 'sin muestras';
    await this.evento('interrumpida', detalle, pendiente.sesion);
    await guardarEstado(null);
    return pendiente.sesion;
  }

  async iniciar(modo: Modo): Promise<void> {
    if (this.watcher) return;
    const sesion = idSesion();
    this.ultimaMs = null;
    this.callbacksPendientes = 0;
    this.publicar({ sesion, modo, muestras: [], callbacks_total: 0, error: null });
    await this.evento('inicio', `modo=${modo}`);
    await guardarEstado({ sesion, inicio_ms: Date.now(), ultima_muestra_ms: null });
    try {
      this.watcher = await iniciarRastreo(
        (posicion) => void this.alRecibir(posicion),
        (error) => void this.alFallar(error),
      );
    } catch (e) {
      await this.alFallar(e as CallbackError);
    }
  }

  async detener(): Promise<void> {
    if (this.watcher) await detenerRastreo(this.watcher);
    this.watcher = null;
    await this.evento('fin', `muestras=${this.estado.muestras.length}`);
    await guardarEstado(null);
    this.publicar({ sesion: null });
  }

  async cambiarModo(modo: Modo): Promise<void> {
    if (modo === this.estado.modo) return;
    this.publicar({ modo });
    await this.evento('modo', `modo=${modo}`);
  }

  async marcarPlano(enSegundoPlano: boolean): Promise<void> {
    this.segundoPlano = enSegundoPlano;
    await this.evento(enSegundoPlano ? 'segundo_plano' : 'primer_plano');
  }

  private async alFallar(error: CallbackError) {
    const detalle = `${error.code ?? 'SIN_CODIGO'}: ${error.message}`;
    this.publicar({ error: detalle });
    await this.evento('error', detalle);
    if (error.code === 'NOT_AUTHORIZED') await abrirAjustes();
  }

  private async alRecibir(posicion: Location) {
    const { sesion, modo } = this.estado;
    if (!sesion) return;
    this.callbacksPendientes++;
    this.publicar({ callbacks_total: this.estado.callbacks_total + 1 });
    if (DIAGNOSTICO) {
      // Aparece en logcat como Capacitor/Console; se compara con las entregas nativas (*location*).
      console.info(`[H3] entrega=${this.estado.callbacks_total} fix=${posicion.time} `
        + `visible=${document.visibilityState} plano=${this.segundoPlano ? 'segundo' : 'primero'}`);
    }

    const ahora = Date.now();
    if (!debeRegistrar(this.ultimaMs, ahora, INTERVALO_OBJETIVO_S[modo])) return;
    const anterior = this.ultimaMs;
    this.ultimaMs = ahora;
    const callbacks = this.callbacksPendientes;
    this.callbacksPendientes = 0;

    const bateria = await Device.getBatteryInfo().catch(() => null);
    const base = {
      fix_ms: posicion.time,
      lat: posicion.latitude,
      lon: posicion.longitude,
      precision_m: posicion.accuracy,
      velocidad_ms: posicion.speed,
      rumbo: posicion.bearing,
    };
    const muestra: Muestra = {
      ...base,
      sesion,
      n: this.estado.muestras.length + 1,
      recibida_iso: new Date(ahora).toISOString(),
      recibida_ms: ahora,
      modo,
      altitud_m: posicion.altitude,
      simulada: posicion.simulated,
      intervalo_s: anterior === null ? null : (ahora - anterior) / 1000,
      callbacks,
      bateria_pct: bateria?.batteryLevel != null ? Math.round(bateria.batteryLevel * 1000) / 10 : null,
      cargando: bateria?.isCharging ?? null,
      segundo_plano: this.segundoPlano,
      bytes_estimados: bytesEstimados(base),
    };
    this.publicar({ muestras: [...this.estado.muestras, muestra] });
    await guardarMuestra(muestra);
    await guardarEstado({ sesion, inicio_ms: this.estado.muestras[0].recibida_ms, ultima_muestra_ms: ahora });
  }
}

export const sesion = new Sesion();
