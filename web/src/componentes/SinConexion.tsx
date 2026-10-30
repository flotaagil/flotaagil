import type { MotivoFalla } from '../api/errores';
import estilos from './SinConexion.module.css';

const TITULO: Record<MotivoFalla, string> = {
  red: 'No se pudo conectar con el servidor',
  servidor: 'El servidor tuvo un error',
};

const DETALLE: Record<MotivoFalla, string> = {
  red: 'Revisa tu conexión. Si el problema sigue, el servidor puede estar detenido.',
  servidor: 'No es un problema de tu conexión. Intenta de nuevo en un momento.',
};

/** Arranque sin servidor: en vez del login, el motivo y Reintentar. */
export function SinConexion({ motivo, alReintentar }: { motivo: MotivoFalla; alReintentar: () => void }) {
  return (
    <main className={estilos.pagina}>
      <section className={estilos.tarjeta} role="alert">
        <h1>{TITULO[motivo]}</h1>
        <p>{DETALLE[motivo]}</p>
        <button type="button" className={estilos.boton} onClick={alReintentar}>
          Reintentar
        </button>
      </section>
    </main>
  );
}
