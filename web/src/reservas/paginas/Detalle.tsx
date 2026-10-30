import { useState } from 'react';
import { Link } from 'react-router';
import { Aviso } from '../../componentes/Aviso';
import { Cargando } from '../../componentes/Cargando';
import { formatearFechaHora } from '../../hora/hora';
import { ErrorApi, useViaje, type ViajeDetalle } from '../api';
import { DialogoCancelar } from '../componentes/DialogoCancelar';
import { EstadoEtiqueta } from '../componentes/EstadoEtiqueta';
import { NoEncontradaReserva } from '../componentes/NoEncontradaReserva';
import { mensajeDeErrorApi } from '../errores';
import { ACTORES, CANALES, ESTADOS, ESTADOS_VUELO, ORIGENES_CANCELACION, SENTIDOS } from '../etiquetas';
import estilos from '../reservas.module.css';
import { useIdDeRuta } from './idDeRuta';

function porQueNo(viaje: ViajeDetalle): string {
  if (viaje.estado === 'ASIGNADO') {
    return 'No se puede editar ni cancelar mientras se espera la respuesta del conductor.';
  }
  if (viaje.estado === 'CANCELADO' || viaje.estado === 'FINALIZADO') return 'La reserva está cerrada.';
  if (viaje.cancelable) return 'Ya fue despachada: se puede cancelar, pero no editar.';
  return 'Ya no admite cambios desde el panel.';
}

export function Detalle() {
  const id = useIdDeRuta();
  if (id === null) return <NoEncontradaReserva />;
  return <DetalleDe id={id} />;
}

function DetalleDe({ id }: { id: number }) {
  const consulta = useViaje(id);
  const [cancelando, setCancelando] = useState(false);
  const [cancelada, setCancelada] = useState(false);

  if (consulta.isPending) return <Cargando />;
  if (consulta.isError) {
    if (consulta.error instanceof ErrorApi && consulta.error.estado === 404) return <NoEncontradaReserva />;
    return (
      <div className={estilos.vacio} role="alert">
        <p>{mensajeDeErrorApi(consulta.error)}</p>
        <button type="button" className={estilos.boton} onClick={() => void consulta.refetch()}>
          Reintentar
        </button>
      </div>
    );
  }
  const viaje = consulta.data;
  const historial = [...viaje.historial].sort((a, b) => Date.parse(a.creado_en) - Date.parse(b.creado_en));

  return (
    <section>
      <div className={estilos.encabezado}>
        <h1>
          Reserva #{viaje.id} {viaje.estado && <EstadoEtiqueta estado={viaje.estado} />}
        </h1>
        <Link to="/reservas" className={estilos.botonSecundario}>
          Volver a las reservas
        </Link>
      </div>

      {cancelada && <Aviso>Reserva cancelada.</Aviso>}

      <div className={estilos.tarjeta}>
        <div className={estilos.acciones}>
          {viaje.editable && (
            <Link to={`/reservas/${viaje.id}/editar`} className={estilos.boton}>
              Editar
            </Link>
          )}
          {viaje.cancelable && (
            <button type="button" className={estilos.botonPeligro} onClick={() => setCancelando(true)}>
              Cancelar reserva…
            </button>
          )}
        </div>
        {!(viaje.editable && viaje.cancelable) && <p className={estilos.explicacion}>{porQueNo(viaje)}</p>}
      </div>

      <div className={estilos.tarjeta}>
        <h2>Datos</h2>
        <dl className={estilos.datos}>
          <div>
            <dt>Recogida</dt>
            <dd>{formatearFechaHora(viaje.recogida_en)}</dd>
          </div>
          <div>
            <dt>Pasajero</dt>
            <dd>
              {viaje.pasajero.nombre} · {viaje.pasajero.telefono}
            </dd>
          </div>
          <div>
            <dt>Origen</dt>
            <dd>{viaje.origen.direccion}</dd>
          </div>
          <div>
            <dt>Destino</dt>
            <dd>{viaje.destino.direccion}</dd>
          </div>
          <div>
            <dt>Sentido</dt>
            <dd>{viaje.sentido ? SENTIDOS[viaje.sentido] : '—'}</dd>
          </div>
          <div>
            <dt>Canal</dt>
            <dd>
              {CANALES[viaje.canal]}
              {viaje.convenio ? ` · ${viaje.convenio.cliente_nombre}` : ''}
            </dd>
          </div>
          {viaje.vuelo && (
            <div>
              <dt>Vuelo</dt>
              <dd>
                {viaje.vuelo.numero} · llegada programada {formatearFechaHora(viaje.vuelo.hora_programada)}
                {viaje.vuelo.hora_estimada && ` · estimada ${formatearFechaHora(viaje.vuelo.hora_estimada)}`}
                {viaje.vuelo.estado_vuelo && ` · ${ESTADOS_VUELO[viaje.vuelo.estado_vuelo]}`}
              </dd>
            </div>
          )}
          <div>
            <dt>Conductor</dt>
            <dd>
              {viaje.conductor?.nombre ?? 'Sin asignar'}
              {viaje.vehiculo ? ` · ${viaje.vehiculo.patente}` : ''}
            </dd>
          </div>
          {viaje.estado === 'CANCELADO' && (
            <div>
              <dt>Cancelación</dt>
              <dd>
                {viaje.motivo_cancelacion ?? '—'}
                {viaje.origen_cancelacion ? ` (${ORIGENES_CANCELACION[viaje.origen_cancelacion]})` : ''}
              </dd>
            </div>
          )}
          <div>
            <dt>Ingresada</dt>
            <dd>{formatearFechaHora(viaje.creado_en)}</dd>
          </div>
        </dl>
      </div>

      <div className={estilos.tarjeta}>
        <h2 id="titulo-historial">Historial de estados</h2>
        <ol className={estilos.historial} aria-labelledby="titulo-historial">
          {historial.map((cambio, indice) => (
            <li key={`${cambio.creado_en}-${indice}`}>
              <strong>
                {cambio.estado_anterior ? `${ESTADOS[cambio.estado_anterior]} → ` : ''}
                {ESTADOS[cambio.estado_nuevo]}
              </strong>
              <span className={estilos.secundario}>
                {formatearFechaHora(cambio.creado_en)} · {ACTORES[cambio.actor]}
                {cambio.usuario ? ` · ${cambio.usuario}` : ''}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {cancelando && (
        <DialogoCancelar
          viaje={viaje}
          alCerrar={() => setCancelando(false)}
          alCancelar={() => {
            setCancelando(false);
            setCancelada(true);
          }}
        />
      )}
    </section>
  );
}
