import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type FormEvent } from 'react';
import { Controller, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { Aviso } from '../../componentes/Aviso';
import { erroresDelBackend } from '../../api/erroresDrf';
import { useEntorno } from '../../entornoContexto';
import { Campo } from '../../formularios/Campo';
import { CampoFechaHora } from '../../formularios/CampoFechaHora';
import { aIso, escribirPared, formatearFechaHora, paredDe } from '../../hora/hora';
import { useSolicitar, type Solicitud, type SolicitudRespuesta } from '../api';
import { Confirmacion } from '../Confirmacion';
import {
  CAMPOS_API,
  camposVisibles,
  clasificarFalla,
  cuerpoSolicitud,
  esquemaSolicitud,
  MENSAJES_PORTAL,
  recogidaMinima,
  SENTIDOS,
  VALORES_INICIALES,
  type ValoresSolicitud,
} from '../formulario';
import { useContextoPortal } from '../contexto';
import { NoDisponible } from '../NoDisponible';
import { TextoPrivacidad } from '../Privacidad';
import { mostrarTelefono, sugerenciaChile } from '../telefono';
import estilos from '../portal.module.css';

interface Enviada {
  cuerpo: Solicitud;
  respuesta: SolicitudRespuesta;
}

/**
 * Formulario del portal. Tras enviar muestra la confirmación en la misma ruta, sin guardar nada en el
 * navegador: con F5 se vuelve al formulario vacío.
 */
export function Solicitar() {
  const [enviada, setEnviada] = useState<Enviada | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [noDisponible, setNoDisponible] = useState(false);
  if (noDisponible) return <NoDisponible />;
  if (enviada) {
    return (
      <Confirmacion
        {...enviada}
        alHacerOtra={() => {
          setEnviada(null);
          setVuelta((n) => n + 1); // formulario nuevo, vacío
        }}
      />
    );
  }
  return <FormularioSolicitud key={vuelta} alEnviar={setEnviada} alNoDisponible={() => setNoDisponible(true)} />;
}

interface Props {
  alEnviar: (enviada: Enviada) => void;
  alNoDisponible: () => void;
}

function FormularioSolicitud({ alEnviar, alNoDisponible }: Props) {
  const { api, empresa, slug } = useContextoPortal();
  const entorno = useEntorno();
  const solicitar = useSolicitar(api, slug);
  const [falla, setFalla] = useState<string | null>(null);
  const [generales, setGenerales] = useState<string[]>([]);
  // Tras una falla sin respuesta, reenviar pide confirmación: la primera pudo haber llegado.
  const [incierto, setIncierto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting, touchedFields },
  } = useForm<ValoresSolicitud>({
    resolver: zodResolver(esquemaSolicitud(empresa, entorno.ahora)),
    defaultValues: VALORES_INICIALES,
  });
  const [sentido, telefono, vueloNumero, recogida] = useWatch({
    control,
    name: ['sentido', 'telefono', 'vuelo.numero', 'recogida.pared'],
  });
  const sugerencia = touchedFields.telefono ? sugerenciaChile(telefono) : null;
  const ahora = entorno.ahora();
  const minimo = recogidaMinima(empresa, ahora);
  const desdeAeropuerto = sentido === 'DESDE_AEROPUERTO';

  async function enviar(valores: ValoresSolicitud) {
    setFalla(null);
    setGenerales([]);
    setConfirmando(false);
    const cuerpo = cuerpoSolicitud(valores);
    try {
      alEnviar({ cuerpo, respuesta: await solicitar.mutateAsync(cuerpo) });
    } catch (error) {
      const resultado = clasificarFalla(error);
      if (resultado.tipo === 'campos') {
        const { campos, generales: otros } = erroresDelBackend(resultado.cuerpo, CAMPOS_API, camposVisibles(valores.sentido));
        Object.entries(campos).forEach(([campo, mensaje], indice) =>
          setError(campo as FieldPath<ValoresSolicitud>, { type: 'servidor', message: mensaje }, { shouldFocus: indice === 0 }),
        );
        setGenerales(otros);
      } else if (resultado.tipo === 'no_disponible') alNoDisponible();
      else if (resultado.tipo === 'incierto') setIncierto(true);
      else setFalla(resultado.mensaje);
    }
  }

  function alEnviarFormulario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (incierto && !confirmando) {
      setConfirmando(true);
      return;
    }
    void handleSubmit(enviar)(evento);
  }

  return (
    <form className={estilos.formulario} onSubmit={alEnviarFormulario} noValidate aria-labelledby="titulo-solicitud">
      <h1 id="titulo-solicitud">Solicitar un viaje</h1>
      <p className={estilos.intro}>
        Te enviaremos un WhatsApp para confirmar tu solicitud. Tendrás {empresa.expiracion_verificacion_min} minutos para
        responderlo.
      </p>

      {incierto && <Aviso tipo="error">{MENSAJES_PORTAL.incierto}</Aviso>}
      {falla && <Aviso tipo="error">{falla}</Aviso>}
      {generales.map((mensaje) => (
        <Aviso key={mensaje} tipo="error">
          {mensaje}
        </Aviso>
      ))}

      <fieldset className={estilos.grupo}>
        <legend>Tus datos</legend>
        <Campo etiqueta="Nombre" error={errors.nombre?.message}>
          {(c) => <input autoComplete="name" enterKeyHint="next" {...c} {...register('nombre')} />}
        </Campo>
        <Campo
          etiqueta="WhatsApp"
          error={errors.telefono?.message}
          ayuda="Incluye el código de país. Chile: +56 9 1234 5678."
        >
          {(c) => (
            <input type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" placeholder="+56 9 1234 5678" {...c} {...register('telefono')} />
          )}
        </Campo>
        {sugerencia && (
          <button
            type="button"
            className={estilos.sugerencia}
            onClick={() => setValue('telefono', sugerencia, { shouldDirty: true, shouldValidate: Boolean(errors.telefono) })}
          >
            ¿Es un celular de Chile? Usar <strong>{mostrarTelefono(sugerencia)}</strong>
          </button>
        )}
      </fieldset>

      <fieldset className={estilos.grupo}>
        <legend>Tu viaje</legend>
        <fieldset className={estilos.opcionesGrandes}>
          <legend>¿Hacia dónde vas?</legend>
          {SENTIDOS.map(({ valor, texto }) => (
            <label key={valor}>
              <input type="radio" value={valor} {...register('sentido')} />
              {texto}
            </label>
          ))}
        </fieldset>

        {desdeAeropuerto && (
          <div className={estilos.vuelo}>
            <Campo etiqueta="Número de vuelo" error={errors.vuelo?.numero?.message} ayuda="Opcional. P. ej. LA123.">
              {(c) => <input autoComplete="off" autoCapitalize="characters" enterKeyHint="next" {...c} {...register('vuelo.numero')} />}
            </Campo>
            <Controller
              control={control}
              name="vuelo.hora"
              render={({ field }) => (
                <CampoFechaHora
                  etiqueta="Llegada del vuelo (hora de Chile)"
                  nombre="vuelo-llegada"
                  valor={field.value}
                  alCambiar={field.onChange}
                  alSalir={field.onBlur}
                  refCampo={field.ref}
                  error={errors.vuelo?.hora?.message}
                />
              )}
            />
          </div>
        )}

        <Campo etiqueta="Dirección de origen" error={errors.origen_dir?.message}>
          {(c) => <input autoComplete="off" enterKeyHint="next" {...c} {...register('origen_dir')} />}
        </Campo>
        <Campo etiqueta="Dirección de destino" error={errors.destino_dir?.message}>
          {(c) => <input autoComplete="off" enterKeyHint="next" {...c} {...register('destino_dir')} />}
        </Campo>

        <Controller
          control={control}
          name="recogida"
          render={({ field }) => (
            <CampoFechaHora
              etiqueta={desdeAeropuerto && vueloNumero ? 'Recogida (hora de Chile, opcional)' : 'Recogida (hora de Chile)'}
              nombre="recogida"
              valor={field.value}
              alCambiar={field.onChange}
              alSalir={field.onBlur}
              refCampo={field.ref}
              error={errors.recogida?.message}
              ayuda={`Ahora en Chile: ${formatearFechaHora(aIso(ahora))}. Con al menos ${empresa.anticipacion_minima_min} minutos de anticipación.`}
              min={escribirPared(paredDe(minimo))}
            />
          )}
        />
        {desdeAeropuerto && vueloNumero && !recogida && (
          <p className={estilos.explicacion}>
            Si no indicas la hora de recogida, la calculamos con la llegada de tu vuelo + {empresa.margen_nacional_min} min.
            La verás al enviar.
          </p>
        )}
      </fieldset>

      <fieldset className={estilos.grupo}>
        <legend>Avisos y privacidad</legend>
        <div className={estilos.aceptacion}>
          <label>
            <input type="checkbox" aria-invalid={errors.acepta_privacidad ? true : undefined} aria-describedby="error-privacidad" {...register('acepta_privacidad')} />
            Acepto el aviso de privacidad.
          </label>
          <details className={estilos.desplegable}>
            <summary>Leer el aviso de privacidad</summary>
            <TextoPrivacidad razonSocial={empresa.razon_social} />
          </details>
          {errors.acepta_privacidad && (
            <span id="error-privacidad" className={estilos.errorCampo}>
              {errors.acepta_privacidad.message}
            </span>
          )}
        </div>
        <div className={estilos.aceptacion}>
          <label>
            <input type="checkbox" aria-invalid={errors.acepta_whatsapp ? true : undefined} aria-describedby="error-whatsapp" {...register('acepta_whatsapp')} />
            Acepto recibir por WhatsApp los avisos de este viaje (confirmación y llegada del conductor).
          </label>
          {errors.acepta_whatsapp && (
            <span id="error-whatsapp" className={estilos.errorCampo}>
              {errors.acepta_whatsapp.message}
            </span>
          )}
        </div>
      </fieldset>

      {/* Campo trampa: fuera de pantalla, oculto para lectores de pantalla y fuera del orden de tabulación. */}
      <div className={estilos.trampa} aria-hidden="true">
        <label>
          Sitio web
          <input type="text" tabIndex={-1} autoComplete="off" {...register('sitio_web')} />
        </label>
      </div>

      {confirmando && (
        <div className={estilos.confirmarReenvio} role="alertdialog" aria-labelledby="titulo-reenvio">
          <p id="titulo-reenvio">
            Si tu primera solicitud sí llegó, al enviarla de nuevo quedará duplicada. ¿Enviar de nuevo?
          </p>
          <div className={estilos.acciones}>
            <button type="button" className={estilos.botonPrincipal} onClick={() => void handleSubmit(enviar)()}>
              Sí, enviar de nuevo
            </button>
            <button type="button" className={estilos.botonSecundario} onClick={() => setConfirmando(false)}>
              Esperar el WhatsApp
            </button>
          </div>
        </div>
      )}

      <div className={estilos.barraEnvio}>
        <button type="submit" className={estilos.botonPrincipal} disabled={isSubmitting}>
          {isSubmitting ? 'Enviando…' : incierto ? 'Enviar de nuevo' : 'Solicitar viaje'}
        </button>
      </div>
    </form>
  );
}
