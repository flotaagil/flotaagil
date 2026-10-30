import type { EstadoViaje } from '../api';
import { ESTADOS, GRUPO_ESTADO } from '../etiquetas';
import estilos from '../reservas.module.css';

/** Estado del viaje con texto (el color solo acompaña). */
export function EstadoEtiqueta({ estado }: { estado: EstadoViaje }) {
  return <span className={`${estilos.etiqueta} ${estilos[GRUPO_ESTADO[estado]]}`}>{ESTADOS[estado]}</span>;
}
