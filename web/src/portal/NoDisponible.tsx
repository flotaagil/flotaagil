import estilos from './portal.module.css';

/** Empresa inexistente o inactiva (404). Sin enlaces al panel. */
export function NoDisponible() {
  return (
    <section className={estilos.tarjeta}>
      <h1>Esta página de solicitudes no está disponible</h1>
      <p>No existe o la empresa ya no recibe solicitudes por aquí. Revisa el enlace que te compartieron.</p>
    </section>
  );
}
