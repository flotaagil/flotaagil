import { createContext, useContext } from 'react';
import type { Entorno } from './entorno';

/**
 * Entorno del navegador (o el falso de las pruebas) para las raíces que se cargan con lazy: la de sesión
 * (panel y login) y la del portal. Vive en el paquete inicial sin arrastrar la sesión.
 */
export const EntornoContexto = createContext<Entorno | null>(null);

export function useEntorno(): Entorno {
  const entorno = useContext(EntornoContexto);
  if (!entorno) throw new Error('Falta EntornoContexto.');
  return entorno;
}
