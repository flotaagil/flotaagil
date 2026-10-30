import { useId, type ReactElement } from 'react';
import estilos from './formularios.module.css';

interface Props {
  etiqueta: string;
  error?: string;
  ayuda?: string;
  ancho?: boolean;
  /** Recibe los atributos de accesibilidad para el control (id, aria-invalid, aria-describedby). */
  children: (control: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => ReactElement;
}

/** Etiqueta, control, ayuda y error. La ayuda y el error quedan fuera de la etiqueta (aria-describedby). */
export function Campo({ etiqueta, error, ayuda, ancho, children }: Props) {
  const id = useId();
  const descripcion = error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined;
  return (
    <div className={`${estilos.campo}${ancho ? ` ${estilos.ancho}` : ''}`}>
      <label htmlFor={id}>{etiqueta}</label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': descripcion })}
      {error ? (
        <span id={`${id}-error`} className={estilos.errorCampo}>
          {error}
        </span>
      ) : (
        ayuda && (
          <span id={`${id}-ayuda`} className={estilos.ayuda}>
            {ayuda}
          </span>
        )
      )}
    </div>
  );
}
