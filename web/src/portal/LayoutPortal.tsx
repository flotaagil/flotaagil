import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router';
import { ErrorApi } from '../api/resultado';
import { MENSAJES } from '../api/errores';
import { useEntorno } from '../entornoContexto';
import { crearClientePortal, useEmpresa, type ClientePortal } from './api';
import type { ContextoPortal } from './contexto';
import { NoDisponible } from './NoDisponible';
import estilos from './portal.module.css';

/**
 * Marco público del portal (/solicitar/:slug): sin sesión ni refresh silencioso. Carga la empresa por su slug
 * y muestra su nombre; si no existe o está inactiva, una página clara en vez del formulario.
 */
export function LayoutPortal() {
  const entorno = useEntorno();
  const [{ api, cliente }] = useState(() => ({
    api: crearClientePortal(entorno),
    cliente: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
  }));
  return (
    <QueryClientProvider client={cliente}>
      <MarcoPortal api={api} />
    </QueryClientProvider>
  );
}

function MarcoPortal({ api }: { api: ClientePortal }) {
  const { slug = '' } = useParams();
  const empresa = useEmpresa(api, slug);
  const razonSocial = empresa.data?.razon_social;

  useEffect(() => {
    document.title = razonSocial ? `Solicitar un viaje · ${razonSocial}` : 'Solicitar un viaje';
  }, [razonSocial]);

  let contenido;
  if (empresa.isPending) {
    contenido = (
      <div className={estilos.esqueleto} role="status" aria-label="Cargando">
        <span />
        <span />
        <span />
      </div>
    );
  } else if (empresa.isError) {
    const estado = empresa.error instanceof ErrorApi ? empresa.error.estado : 0;
    const delServidor = estado === 500 || (estado > 504 && estado < 600);
    contenido =
      estado === 404 ? (
        <NoDisponible />
      ) : (
        <section className={estilos.tarjeta} role="alert">
          <h1>{delServidor ? 'El servidor tuvo un error' : 'No se pudo conectar con el servidor'}</h1>
          <p>{delServidor ? MENSAJES.error_servidor : MENSAJES.sin_conexion}</p>
          <button type="button" className={estilos.botonPrincipal} onClick={() => void empresa.refetch()}>
            Reintentar
          </button>
        </section>
      );
  } else contenido = <Outlet context={{ api, empresa: empresa.data, slug } satisfies ContextoPortal} />;

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecera}>
        <span className={estilos.marca}>{razonSocial ?? 'Solicitar un viaje'}</span>
        {razonSocial && <span className={estilos.subtitulo}>Solicitar un viaje</span>}
      </header>
      <main className={estilos.contenido}>{contenido}</main>
      <footer className={estilos.piePagina}>
        {empresa.data && <Link to={`/solicitar/${slug}/privacidad`}>Aviso de privacidad</Link>}
        <span>Operado con FlotaÁgil</span>
      </footer>
    </div>
  );
}
