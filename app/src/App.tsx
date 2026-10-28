import { App as CapacitorApp } from '@capacitor/app';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Consentimiento } from './Consentimiento';
import { consentimientoAceptado } from './consentimiento-estado';
import { borrarTodo, exportar, leerEventos, leerMuestras } from './gps/almacen';
import { porSesion, resumir, type Resumen } from './gps/metricas';
import { sesion, type EstadoVivo } from './gps/sesion';
import {
  DATOS_TURNO_MAX_MB,
  HUECO_MAXIMO_S,
  INTERVALO_OBJETIVO_S,
  PRECISION_P95_MAX_M,
  type Evento,
  type Modo,
} from './gps/tipos';

const fmt = (v: number | null | undefined, decimales = 1, unidad = '') =>
  v === null || v === undefined ? '—' : `${v.toFixed(decimales)}${unidad}`;

const veredicto = (cumple: boolean | null) => (cumple === null ? '—' : cumple ? '✓' : '✗');

function TablaResumen({ r }: { r: Resumen }) {
  return (
    <table className="resumen">
      <tbody>
        <tr><th>Duración</th><td>{fmt(r.duracion_h * 60, 0, ' min')} · {r.muestras} muestras</td></tr>
        {(['viaje', 'espera'] as Modo[]).map((modo) => {
          const m = r.por_modo[modo];
          return m.intervalos > 0 ? (
            <tr key={modo}>
              <th>Intervalo {modo} (obj. {m.objetivo_s} s)</th>
              <td>mediana {fmt(m.mediana_s)} s · p95 {fmt(m.p95_s)} s · máx {fmt(m.max_s)} s</td>
            </tr>
          ) : null;
        })}
        <tr>
          <th>Huecos &gt; {HUECO_MAXIMO_S} s</th>
          <td>{r.huecos} (máx {fmt(r.hueco_max_s)} s) {veredicto(r.cumple_huecos)}</td>
        </tr>
        <tr>
          <th>Precisión (p95 ≤ {PRECISION_P95_MAX_M} m)</th>
          <td>mediana {fmt(r.precision_mediana_m)} m · p95 {fmt(r.precision_p95_m)} m {veredicto(r.cumple_precision)}</td>
        </tr>
        <tr><th>Batería sin cargar</th><td>{fmt(r.bateria_pct_h, 1, ' %/h')}</td></tr>
        <tr>
          <th>Datos estimados (&lt; {DATOS_TURNO_MAX_MB} MB/turno)</th>
          <td>{fmt(r.mb_hora, 3, ' MB/h')} · {fmt(r.mb_turno, 2, ' MB/8 h')} {veredicto(r.cumple_datos)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export default function App() {
  const [aceptado, setAceptado] = useState(consentimientoAceptado);
  const [vivo, setVivo] = useState<EstadoVivo | null>(null);
  const [historial, setHistorial] = useState<Resumen[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const [muestras, evs] = await Promise.all([leerMuestras(), leerEventos()]);
    setHistorial([...porSesion(muestras).values()].map((m) => resumir(m)!).reverse());
    setEventos(evs);
  }, []);

  useEffect(() => sesion.suscribir(setVivo), []);

  useEffect(() => {
    void sesion.revisarInterrumpida().then((id) => {
      if (id) setAviso(`La sesión ${id} se cerró sin detenerla (app cerrada o terminada por el sistema).`);
      return recargar();
    });
    const oyente = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      void sesion.marcarPlano(!isActive);
    });
    return () => void oyente.then((o) => o.remove());
  }, [recargar]);

  const actual = useMemo(() => (vivo?.muestras.length ? resumir(vivo.muestras) : null), [vivo]);

  if (!aceptado) return <Consentimiento alAceptar={() => setAceptado(true)} />;
  if (!vivo) return null;

  const enCurso = vivo.sesion !== null;
  const ultima = vivo.muestras.at(-1);

  const detener = async () => {
    await sesion.detener();
    await recargar();
  };

  const compartir = async () => {
    if (!(await exportar())) setAviso('Todavía no hay mediciones para exportar.');
  };

  const borrar = async () => {
    if (!window.confirm('¿Borrar todas las mediciones guardadas en el teléfono? Exporta antes si las necesitas.')) return;
    await borrarTodo();
    await recargar();
  };

  return (
    <main>
      <h1>PoC GPS · H-3</h1>
      {aviso && <p className="aviso" onClick={() => setAviso(null)}>{aviso}</p>}
      {vivo.error && <p className="error">{vivo.error}</p>}

      <section>
        <div className="modos">
          {(['viaje', 'espera'] as Modo[]).map((modo) => (
            <button
              key={modo}
              className={vivo.modo === modo ? 'activo' : ''}
              onClick={() => void sesion.cambiarModo(modo)}
            >
              {modo === 'viaje' ? 'En viaje' : 'En espera'} ({INTERVALO_OBJETIVO_S[modo]} s)
            </button>
          ))}
        </div>
        {enCurso ? (
          <button className="principal detener" onClick={() => void detener()}>Detener sesión</button>
        ) : (
          <button className="principal" onClick={() => void sesion.iniciar(vivo.modo)}>Iniciar sesión</button>
        )}
      </section>

      {enCurso && (
        <section>
          <h2>Sesión {vivo.sesion}</h2>
          <p>
            Entregas del plugin: {vivo.callbacks_total} · Última muestra:{' '}
            {ultima ? `${new Date(ultima.recibida_ms).toLocaleTimeString()} (±${fmt(ultima.precision_m, 0)} m)` : 'esperando GPS…'}
          </p>
          {actual && <TablaResumen r={actual} />}
        </section>
      )}

      <section>
        <h2>Sesiones guardadas</h2>
        <div className="acciones">
          <button onClick={() => void compartir()}>Exportar CSV</button>
          <button onClick={() => void borrar()} disabled={enCurso}>Borrar todo</button>
        </div>
        {historial.length === 0 && <p>Sin sesiones todavía.</p>}
        {historial.map((r) => (
          <details key={r.sesion}>
            <summary>
              {r.sesion} · {fmt(r.duracion_h * 60, 0, ' min')}
              {eventos.some((e) => e.sesion === r.sesion && e.tipo === 'interrumpida') && ' · interrumpida'}
            </summary>
            <TablaResumen r={r} />
          </details>
        ))}
      </section>
    </main>
  );
}
