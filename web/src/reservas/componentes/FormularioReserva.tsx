import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { Link } from 'react-router';
import { Aviso } from '../../componentes/Aviso';
import { ErrorApi } from '../../api/resultado';
import type { ViajeDetalle } from '../api';
import { erroresDelBackend } from '../errores';
import { CANALES, SENTIDOS } from '../etiquetas';
import {
  CAMPOS_DEL_MODO,
  CANALES_PANEL,
  completarTelefono,
  esquemaReserva,
  SENTIDOS_FORMULARIO,
  type Modificados,
  type Modo,
  type ValoresReserva,
} from '../formulario';
import campos from '../../formularios/formularios.module.css';
import estilos from '../reservas.module.css';
import { Campo } from '../../formularios/Campo';
import { CampoFechaHora } from '../../formularios/CampoFechaHora';

interface Props {
  modo: Modo;
  iniciales: ValoresReserva;
  /** Al editar: la reserva (pasajero y canal en solo lectura, vuelo registrado). */
  viaje?: ViajeDetalle;
  /** Envía a la API; si falla, lanza el error (un 400 se muestra en cada campo). */
  enviar: (valores: ValoresReserva, modificados: Modificados) => Promise<void>;
  /** Mensaje para un error que no es un 400 (red, 409, 500…). */
  describirFalla: (error: unknown) => ReactNode;
  /** Deshabilita el formulario (p. ej. tras un 409) con este aviso. */
  bloqueo?: ReactNode;
  volverA: string;
}

export function FormularioReserva({ modo, iniciales, viaje, enviar, describirFalla, bloqueo, volverA }: Props) {
  const [falla, setFalla] = useState<ReactNode>(null);
  const [generales, setGenerales] = useState<string[]>([]);
  const {
    register,
    control,
    handleSubmit,
    getValues,
    setValue,
    setError,
    formState: { errors, isSubmitting, dirtyFields, isDirty },
  } = useForm<ValoresReserva>({ resolver: zodResolver(esquemaReserva(modo)), defaultValues: iniciales });
  const sentido = useWatch({ control, name: 'sentido' });

  function completar() {
    const telefono = getValues('pasajero.telefono');
    const completo = completarTelefono(telefono);
    if (completo !== telefono) setValue('pasajero.telefono', completo, { shouldDirty: true });
  }

  async function alEnviar(valores: ValoresReserva) {
    setFalla(null);
    setGenerales([]);
    if (modo === 'editar' && !isDirty) {
      setFalla('No hay cambios que guardar.');
      return;
    }
    try {
      await enviar(valores, dirtyFields as Modificados);
    } catch (error) {
      if (error instanceof ErrorApi && error.estado === 400) {
        const { campos, generales: otros } = erroresDelBackend(error.cuerpo, CAMPOS_DEL_MODO[modo]);
        Object.entries(campos).forEach(([campo, mensaje], indice) =>
          setError(campo as FieldPath<ValoresReserva>, { type: 'servidor', message: mensaje }, { shouldFocus: indice === 0 }),
        );
        setGenerales(otros);
      } else {
        setFalla(describirFalla(error));
      }
    }
  }

  function alEnviarFormulario(evento: FormEvent<HTMLFormElement>) {
    // El teléfono se completa a la vista antes de validar.
    if (modo === 'crear') completar();
    void handleSubmit(alEnviar)(evento);
  }

  // Mientras se envía solo se desactiva el botón: los campos siguen enfocables para mostrar los errores.
  const bloqueado = Boolean(bloqueo);

  return (
    <form className={estilos.formulario} onSubmit={alEnviarFormulario} noValidate>
      {bloqueo && <Aviso tipo="error">{bloqueo}</Aviso>}
      {falla && <Aviso tipo="error">{falla}</Aviso>}
      {generales.map((mensaje) => (
        <Aviso key={mensaje} tipo="error">
          {mensaje}
        </Aviso>
      ))}

      <fieldset disabled={bloqueado}>
        <legend>Pasajero</legend>
        {modo === 'crear' ? (
          <>
            <Campo etiqueta="Nombre" error={errors.pasajero?.nombre?.message}>
              {(control) => <input autoComplete="off" {...control} {...register('pasajero.nombre')} />}
            </Campo>
            <Campo
              etiqueta="Teléfono (WhatsApp)"
              error={errors.pasajero?.telefono?.message}
              ayuda="Formato +56912345678. Un móvil de 9 dígitos se completa con +56."
            >
              {(control) => (
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  {...control}
                  {...register('pasajero.telefono', { onBlur: completar })}
                />
              )}
            </Campo>
            <fieldset className={campos.opciones}>
              <legend>Canal</legend>
              {CANALES_PANEL.map((canal) => (
                <label key={canal} className={campos.opcion}>
                  <input type="radio" value={canal} {...register('canal')} />
                  {CANALES[canal]}
                </label>
              ))}
            </fieldset>
          </>
        ) : (
          viaje && (
            <dl className={`${estilos.soloLectura} ${campos.ancho}`}>
              <dt>Nombre</dt>
              <dd>{viaje.pasajero.nombre}</dd>
              <dt>Teléfono</dt>
              <dd>{viaje.pasajero.telefono}</dd>
              <dt>Canal</dt>
              <dd>{CANALES[viaje.canal]}</dd>
              <dd className={campos.ayuda}>El pasajero, su teléfono y el canal no se pueden cambiar al editar.</dd>
            </dl>
          )
        )}
      </fieldset>

      <fieldset disabled={bloqueado}>
        <legend>Trayecto</legend>
        <fieldset className={`${campos.opciones} ${campos.ancho}`}>
          <legend>Sentido</legend>
          {SENTIDOS_FORMULARIO.map((valor) => (
            <label key={valor} className={campos.opcion}>
              <input type="radio" value={valor} {...register('sentido')} />
              {SENTIDOS[valor]}
            </label>
          ))}
        </fieldset>
        <Campo etiqueta="Origen" error={errors.origen_dir?.message} ancho>
          {(control) => <input autoComplete="off" {...control} {...register('origen_dir')} />}
        </Campo>
        <Campo etiqueta="Destino" error={errors.destino_dir?.message} ancho>
          {(control) => <input autoComplete="off" {...control} {...register('destino_dir')} />}
        </Campo>
        <Controller
          control={control}
          name="recogida"
          render={({ field }) => (
            <CampoFechaHora
              etiqueta="Recogida"
              nombre="recogida"
              valor={field.value}
              alCambiar={field.onChange}
              alSalir={field.onBlur}
              error={errors.recogida?.message}
              ayuda="Hora de Chile continental (Santiago)."
            />
          )}
        />
      </fieldset>

      {sentido === 'DESDE_AEROPUERTO' ? (
        <fieldset disabled={bloqueado}>
          <legend>Vuelo (opcional)</legend>
          <Campo etiqueta="Número de vuelo" error={errors.vuelo?.numero?.message}>
            {(control) => (
              <input autoComplete="off" autoCapitalize="characters" placeholder="LA123" {...control} {...register('vuelo.numero')} />
            )}
          </Campo>
          <Controller
            control={control}
            name="vuelo.hora"
            render={({ field }) => (
              <CampoFechaHora
                etiqueta="Llegada programada"
                nombre="vuelo-hora"
                valor={field.value}
                alCambiar={field.onChange}
                alSalir={field.onBlur}
                error={errors.vuelo?.hora?.message}
              />
            )}
          />
        </fieldset>
      ) : (
        modo === 'editar' &&
        viaje?.vuelo && <Aviso>Al guardar con este sentido se quitará el vuelo registrado ({viaje.vuelo.numero}).</Aviso>
      )}

      <div className={estilos.pie}>
        <button type="submit" className={estilos.boton} disabled={bloqueado || isSubmitting}>
          {isSubmitting ? 'Guardando…' : modo === 'crear' ? 'Guardar reserva' : 'Guardar cambios'}
        </button>
        <Link to={volverA} className={estilos.botonSecundario}>
          Volver
        </Link>
      </div>
    </form>
  );
}
