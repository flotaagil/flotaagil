import { useRouteError } from 'react-router';
import estilos from './SinConexion.module.css';

/** El chunk de una pantalla no se pudo descargar: típico tras un despliegue (los nombres con hash cambian). */
export function esFallaDeCarga(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    /dynamically imported module|module script|Importing a module|Failed to fetch/i.test(error.message)
  );
}

export function ErrorDeRuta() {
  const error = useRouteError();
  const carga = esFallaDeCarga(error);
  return (
    <main className={estilos.pagina}>
      <section className={estilos.tarjeta} role="alert">
        <h1>{carga ? 'Hay una versión nueva del panel' : 'Ocurrió un error inesperado'}</h1>
        <p>
          {carga
            ? 'No se pudo cargar esta pantalla. Recarga para usar la versión actual.'
            : 'Recarga la página. Si el problema sigue, avisa al administrador.'}
        </p>
        <button type="button" className={estilos.boton} onClick={() => window.location.reload()}>
          Recargar
        </button>
      </section>
    </main>
  );
}
