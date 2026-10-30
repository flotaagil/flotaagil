import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Aviso } from '../../componentes/Aviso';
import { formatearFecha, formatearFechaHora, formatearPared } from '../../hora/hora';
import { ErrorApi, useViajes, type Canal, type EstadoViaje, type Sentido } from '../api';
import { EstadoEtiqueta } from '../componentes/EstadoEtiqueta';
import { mensajeDeErrorApi } from '../errores';
import { CANALES, ESTADOS, ORDEN_ESTADOS, ORDENES, SENTIDOS, type Orden } from '../etiquetas';
import {
  cambiarFiltros,
  consultaDeFiltros,
  escribirFiltros,
  hayFiltros,
  leerFiltros,
  POR_PAGINA,
  SIN_FILTROS,
  type Filtros,
} from '../filtros';
import estilos from '../reservas.module.css';

const ESPERA_BUSQUEDA_MS = 300;
const numero = new Intl.NumberFormat('es-CL');

interface Chip {
  clave: string;
  texto: string;
  error?: string;
  quitar: Partial<Filtros>;
}

function chipsDe(f: Filtros, errores: { desde?: string; hasta?: string }): Chip[] {
  const chips: Chip[] = [];
  if (f.desdeHoy) chips.push({ clave: 'desdeHoy', texto: 'Desde hoy 00:00', quitar: { desdeHoy: false } });
  if (f.desde) {
    chips.push({ clave: 'desde', texto: `Desde ${formatearPared(f.desde)}`, error: errores.desde, quitar: { desde: null } });
  }
  if (f.hasta) {
    chips.push({ clave: 'hasta', texto: `Hasta ${formatearPared(f.hasta)}`, error: errores.hasta, quitar: { hasta: null } });
  }
  if (f.fecha) chips.push({ clave: 'fecha', texto: `Día ${formatearFecha(f.fecha)}`, quitar: { fecha: null } });
  for (const estado of f.estado) {
    chips.push({ clave: `estado-${estado}`, texto: ESTADOS[estado], quitar: { estado: f.estado.filter((e) => e !== estado) } });
  }
  if (f.sentido) chips.push({ clave: 'sentido', texto: SENTIDOS[f.sentido], quitar: { sentido: null } });
  if (f.canal) chips.push({ clave: 'canal', texto: `Canal: ${CANALES[f.canal]}`, quitar: { canal: null } });
  if (f.q.trim()) chips.push({ clave: 'q', texto: `«${f.q.trim()}»`, quitar: { q: '' } });
  return chips;
}

export function Listado() {
  const [parametros, setParametros] = useSearchParams();
  const filtros = useMemo(() => leerFiltros(parametros), [parametros]);
  // «hoy» se fija al cargar la pantalla (y al cambiar los filtros), no en cada render.
  const { consulta, errores } = useMemo(() => consultaDeFiltros(filtros), [filtros]);
  const lista = useViajes(consulta);

  function aplicar(cambios: Partial<Filtros>, opciones: { replace?: boolean } = {}) {
    setParametros(escribirFiltros(cambiarFiltros(filtros, cambios)), opciones);
  }

  // Búsqueda: se escribe en la URL tras 300 ms sin teclear, reemplazando la entrada del historial.
  const [busqueda, setBusqueda] = useState(filtros.q);
  const [busquedaEnUrl, setBusquedaEnUrl] = useState(filtros.q);
  if (filtros.q !== busquedaEnUrl) {
    // La URL cambió desde afuera (atrás/adelante, quitar filtro): el campo la sigue.
    setBusquedaEnUrl(filtros.q);
    setBusqueda(filtros.q);
  }
  useEffect(() => {
    if (busqueda === filtros.q) return;
    const temporizador = setTimeout(() => {
      setParametros(escribirFiltros(cambiarFiltros(filtros, { q: busqueda })), { replace: true });
    }, ESPERA_BUSQUEDA_MS);
    return () => clearTimeout(temporizador);
  }, [busqueda, filtros, setParametros]);

  // En celular los filtros quedan plegados; en escritorio siempre a la vista (CSS).
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const chips = chipsDe(filtros, errores);
  const datos = lista.data;
  const paginas = datos ? Math.max(1, Math.ceil(datos.count / POR_PAGINA)) : 1;
  const paginaInexistente = lista.error instanceof ErrorApi && lista.error.estado === 404 && filtros.pagina > 1;

  return (
    <section>
      <div className={estilos.encabezado}>
        <h1>Reservas</h1>
        <Link to="/reservas/nueva" className={estilos.boton}>
          Nueva reserva
        </Link>
      </div>

      <div className={estilos.filtros}>
        <button
          type="button"
          className={estilos.botonFiltros}
          aria-expanded={filtrosAbiertos}
          aria-controls="campos-filtro"
          onClick={() => setFiltrosAbiertos((abiertos) => !abiertos)}
        >
          Filtros{chips.length ? ` (${chips.length})` : ''}
        </button>
        <div id="campos-filtro" className={estilos.camposFiltro} data-abierto={filtrosAbiertos} role="search">
          <label className={`${estilos.campo} ${estilos.busqueda}`}>
            Buscar
            <input
              type="search"
              placeholder="Pasajero, teléfono, dirección o vuelo"
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
            />
          </label>
          <div className={estilos.campo}>
            <span id="filtro-estado">Estado</span>
            <details className={estilos.estados}>
              <summary aria-labelledby="filtro-estado">
                {filtros.estado.length ? `${filtros.estado.length} seleccionados` : 'Todos'}
              </summary>
              <div className={estilos.opcionesEstado} role="group" aria-labelledby="filtro-estado">
                {ORDEN_ESTADOS.map((estado) => (
                  <label key={estado} className={estilos.opcion}>
                    <input
                      type="checkbox"
                      checked={filtros.estado.includes(estado)}
                      onChange={(evento) =>
                        aplicar({
                          estado: evento.target.checked
                            ? [...filtros.estado, estado]
                            : filtros.estado.filter((e: EstadoViaje) => e !== estado),
                        })
                      }
                    />
                    {ESTADOS[estado]}
                  </label>
                ))}
              </div>
            </details>
          </div>
          <label className={estilos.campo}>
            Sentido
            <select
              value={filtros.sentido ?? ''}
              onChange={(evento) => aplicar({ sentido: (evento.target.value || null) as Sentido | null })}
            >
              <option value="">Todos</option>
              {Object.entries(SENTIDOS).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </label>
          <label className={estilos.campo}>
            Canal
            <select
              value={filtros.canal ?? ''}
              onChange={(evento) => aplicar({ canal: (evento.target.value || null) as Canal | null })}
            >
              <option value="">Todos</option>
              {Object.entries(CANALES).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </label>
          <label className={estilos.campo}>
            Día de recogida
            <input
              type="date"
              value={filtros.fecha ?? ''}
              onChange={(evento) => aplicar({ fecha: evento.target.value || null })}
            />
          </label>
          <label className={estilos.campo}>
            Desde
            <input
              type="datetime-local"
              step={60}
              value={filtros.desde ?? ''}
              aria-invalid={errores.desde ? true : undefined}
              onChange={(evento) => aplicar({ desde: evento.target.value || null })}
            />
          </label>
          <label className={estilos.campo}>
            Hasta
            <input
              type="datetime-local"
              step={60}
              value={filtros.hasta ?? ''}
              aria-invalid={errores.hasta ? true : undefined}
              onChange={(evento) => aplicar({ hasta: evento.target.value || null })}
            />
          </label>
          <label className={`${estilos.campo} ${estilos.doble}`}>
            Ordenar por
            <select
              value={filtros.ordenar ?? 'recogida_en'}
              onChange={(evento) => aplicar({ ordenar: evento.target.value === 'recogida_en' ? null : (evento.target.value as Orden) })}
            >
              {Object.entries(ORDENES).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {chips.length > 0 && (
        <ul className={estilos.chips} aria-label="Filtros activos">
          {chips.map((chip) => (
            <li key={chip.clave} className={estilos.chip} data-error={chip.error ? true : undefined}>
              {chip.texto}
              <button type="button" aria-label={`Quitar filtro ${chip.texto}`} onClick={() => aplicar(chip.quitar)}>
                ×
              </button>
            </li>
          ))}
          <li>
            <button type="button" className={estilos.quitarTodo} onClick={() => aplicar({ ...SIN_FILTROS, ordenar: filtros.ordenar })}>
              Quitar filtros
            </button>
          </li>
        </ul>
      )}
      {[errores.desde, errores.hasta].filter(Boolean).map((mensaje) => (
        <Aviso key={mensaje} tipo="error">
          {mensaje} El filtro no se aplicó.
        </Aviso>
      ))}

      {lista.isPending ? (
        <Esqueleto />
      ) : paginaInexistente ? (
        <div className={estilos.vacio}>
          <p>Esa página no existe.</p>
          <button type="button" className={estilos.botonSecundario} onClick={() => aplicar({ pagina: 1 })}>
            Ir a la primera página
          </button>
        </div>
      ) : lista.isError ? (
        <div className={estilos.vacio} role="alert">
          <p>{mensajeDeErrorApi(lista.error)}</p>
          <button type="button" className={estilos.boton} onClick={() => void lista.refetch()}>
            Reintentar
          </button>
        </div>
      ) : datos && datos.results.length === 0 ? (
        <div className={estilos.vacio}>
          {hayFiltros(filtros) ? (
            <>
              <p>Ninguna reserva coincide con los filtros.</p>
              <button type="button" className={estilos.botonSecundario} onClick={() => aplicar({ ...SIN_FILTROS, ordenar: filtros.ordenar })}>
                Quitar filtros
              </button>
            </>
          ) : (
            <>
              <p>Aún no hay reservas.</p>
              <Link to="/reservas/nueva" className={estilos.boton}>
                Nueva reserva
              </Link>
            </>
          )}
        </div>
      ) : (
        datos && (
          <>
            <p className={estilos.resumen} aria-live="polite">
              <span>
                {numero.format(datos.count)} {datos.count === 1 ? 'reserva' : 'reservas'} · página {filtros.pagina} de {paginas}
              </span>
              {lista.isFetching && <span>Actualizando…</span>}
            </p>
            <table className={estilos.tabla} aria-busy={lista.isPlaceholderData || undefined}>
              <thead>
                <tr>
                  <th scope="col">Recogida</th>
                  <th scope="col">Pasajero</th>
                  <th scope="col">Trayecto</th>
                  <th scope="col">Sentido</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Conductor</th>
                </tr>
              </thead>
              <tbody>
                {datos.results.map((viaje) => (
                  <tr key={viaje.id}>
                    <Celda titulo="Recogida">
                      <Link to={`/reservas/${viaje.id}`}>{formatearFechaHora(viaje.recogida_en)}</Link>
                      <span className={estilos.secundario}>#{viaje.id}</span>
                    </Celda>
                    <Celda titulo="Pasajero">
                      {viaje.pasajero.nombre}
                      <span className={estilos.secundario}>{viaje.pasajero.telefono}</span>
                    </Celda>
                    <Celda titulo="Trayecto" ancho>
                      {viaje.origen.direccion}
                      <span className={estilos.secundario}>→ {viaje.destino.direccion}</span>
                    </Celda>
                    <Celda titulo="Sentido">
                      {viaje.sentido ? SENTIDOS[viaje.sentido] : '—'}
                      <span className={estilos.secundario}>
                        {CANALES[viaje.canal]}
                        {viaje.vuelo ? ` · ${viaje.vuelo.numero}` : ''}
                      </span>
                    </Celda>
                    <Celda titulo="Estado">
                      <EstadoEtiqueta estado={viaje.estado ?? 'SOLICITADO'} />
                    </Celda>
                    <Celda titulo="Conductor">{viaje.conductor?.nombre ?? '—'}</Celda>
                  </tr>
                ))}
              </tbody>
            </table>
            {paginas > 1 && (
              <nav className={estilos.paginacion} aria-label="Paginación">
                <button
                  type="button"
                  className={estilos.botonSecundario}
                  disabled={!datos.previous}
                  onClick={() => aplicar({ pagina: filtros.pagina - 1 })}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className={estilos.botonSecundario}
                  disabled={!datos.next}
                  onClick={() => aplicar({ pagina: filtros.pagina + 1 })}
                >
                  Siguiente
                </button>
              </nav>
            )}
          </>
        )
      )}
    </section>
  );
}

/** Celda con su título: en celular la tabla pasa a tarjetas y el título va a la izquierda (CSS). */
function Celda({ titulo, ancho, children }: { titulo: string; ancho?: boolean; children: ReactNode }) {
  return (
    <td data-titulo={titulo} className={ancho ? estilos.trayecto : undefined}>
      <div>{children}</div>
    </td>
  );
}

function Esqueleto() {
  return (
    <table className={estilos.tabla} aria-busy="true" aria-label="Cargando reservas">
      <tbody>
        {Array.from({ length: 5 }, (_, i) => (
          <tr key={i} className={estilos.esqueleto}>
            <td colSpan={6}>
              <span />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
