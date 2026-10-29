import estilos from './Cargando.module.css';

export function Cargando() {
  return (
    <div className={estilos.cargando} role="status" aria-live="polite">
      Cargando…
    </div>
  );
}
