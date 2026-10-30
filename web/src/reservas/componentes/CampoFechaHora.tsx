import { useId } from 'react';
import { instanteDeCampo, ocurrencias, type ValorFechaHora } from '../../hora/hora';
import estilos from '../reservas.module.css';

interface Props {
  etiqueta: string;
  valor: ValorFechaHora;
  alCambiar: (valor: ValorFechaHora) => void;
  alSalir?: () => void;
  error?: string;
  ayuda?: string;
  nombre: string;
}

/**
 * Fecha y hora en Santiago (`datetime-local`). Una hora inexistente se avisa de inmediato; una repetida
 * muestra un aviso con el desfase aplicado y el selector «primera (UTC−3) / segunda (UTC−4)».
 */
export function CampoFechaHora({ etiqueta, valor, alCambiar, alSalir, error, ayuda, nombre }: Props) {
  const id = useId();
  const repetida = ocurrencias(valor.pared);
  const resultado = valor.pared ? instanteDeCampo(valor) : null;
  const inexistente = resultado && !resultado.ok && resultado.motivo === 'inexistente' ? resultado.mensaje : null;
  const mensaje = error ?? inexistente;
  return (
    <div className={estilos.campo}>
      <label htmlFor={id}>{etiqueta}</label>
      <input
        id={id}
        name={nombre}
        type="datetime-local"
        step={60}
        value={valor.pared}
        aria-invalid={mensaje ? true : undefined}
        aria-describedby={mensaje ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined}
        onChange={(evento) => alCambiar({ pared: evento.target.value, ocurrencia: 'primera' })}
        onBlur={alSalir}
      />
      {ayuda && !mensaje && (
        <span id={`${id}-ayuda`} className={estilos.ayuda}>
          {ayuda}
        </span>
      )}
      {mensaje && (
        <span id={`${id}-error`} className={estilos.errorCampo} role="alert">
          {mensaje}
        </span>
      )}
      {repetida && (
        <div className={estilos.avisoHora} role="status">
          <p>
            Esta hora ocurre dos veces por el cambio al horario de invierno. Se usará la{' '}
            <strong>
              {valor.ocurrencia} ({repetida[valor.ocurrencia]})
            </strong>
            .
          </p>
          <fieldset className={estilos.opciones}>
            <legend>¿Cuál de las dos?</legend>
            {(['primera', 'segunda'] as const).map((ocurrencia) => (
              <label key={ocurrencia} className={estilos.opcion}>
                <input
                  type="radio"
                  name={`${nombre}-ocurrencia`}
                  checked={valor.ocurrencia === ocurrencia}
                  onChange={() => alCambiar({ pared: valor.pared, ocurrencia })}
                />
                {ocurrencia} ({repetida[ocurrencia]})
              </label>
            ))}
          </fieldset>
        </div>
      )}
    </div>
  );
}
