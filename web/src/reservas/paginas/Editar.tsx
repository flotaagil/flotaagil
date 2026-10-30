import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Cargando } from '../../componentes/Cargando';
import { ErrorApi, useEditarViaje, useViaje, type ViajeDetalle } from '../api';
import { FormularioReserva } from '../componentes/FormularioReserva';
import { NoEncontradaReserva } from '../componentes/NoEncontradaReserva';
import { mensajeDeErrorApi } from '../errores';
import { ESTADOS } from '../etiquetas';
import { cuerpoEditar, valoresDeViaje } from '../formulario';
import estilos from '../reservas.module.css';
import { useIdDeRuta } from './idDeRuta';

export function Editar() {
  const id = useIdDeRuta();
  if (id === null) return <NoEncontradaReserva />;
  return <EditarDe id={id} />;
}

function EditarDe({ id }: { id: number }) {
  const consulta = useViaje(id);
  // Tras un 409 el formulario queda bloqueado con lo escrito a la vista.
  const [conflicto, setConflicto] = useState<string | null>(null);

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
  if (!viaje.editable && !conflicto) {
    return (
      <section>
        <h1>Editar reserva #{viaje.id}</h1>
        <p>
          Esta reserva ya no se puede editar: está en estado {viaje.estado ? ESTADOS[viaje.estado] : '—'}. Solo se
          editan las reservas pendientes de confirmación o solicitadas (antes del despacho).
        </p>
        <Link to={`/reservas/${viaje.id}`}>Ver la reserva</Link>
      </section>
    );
  }
  return <Edicion viaje={viaje} conflicto={conflicto} alConflicto={setConflicto} />;
}

interface PropsEdicion {
  viaje: ViajeDetalle;
  conflicto: string | null;
  alConflicto: (mensaje: string) => void;
}

function Edicion({ viaje, conflicto, alConflicto }: PropsEdicion) {
  const editar = useEditarViaje(viaje.id);
  const navegar = useNavigate();
  // Los valores iniciales se toman una vez: si el detalle se recarga (p. ej. tras un 409), no se reinicia.
  const [iniciales] = useState(() => valoresDeViaje(viaje));
  const volverA = `/reservas/${viaje.id}`;
  return (
    <section>
      <div className={estilos.encabezado}>
        <h1>Editar reserva #{viaje.id}</h1>
      </div>
      <FormularioReserva
        modo="editar"
        iniciales={iniciales}
        viaje={viaje}
        volverA={volverA}
        bloqueo={
          conflicto && (
            <>
              {conflicto} Estado actual: {viaje.estado ? ESTADOS[viaje.estado] : '—'}.{' '}
              <Link to={volverA}>Ver la reserva</Link>
            </>
          )
        }
        enviar={async (valores, modificados) => {
          await editar.mutateAsync(cuerpoEditar(valores, modificados));
          navegar(volverA, { replace: true });
        }}
        describirFalla={(error) => {
          if (error instanceof ErrorApi && error.estado === 409) {
            alConflicto(mensajeDeErrorApi(error));
            return null;
          }
          return mensajeDeErrorApi(error);
        }}
      />
    </section>
  );
}
