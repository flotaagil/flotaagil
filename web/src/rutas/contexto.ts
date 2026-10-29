import { createContext, useContext } from 'react';
import type { RouteObject } from 'react-router';

/** Tabla de rutas activa: la usan el menú y la validación de `volver`. */
export const RutasContexto = createContext<RouteObject[]>([]);

export function useRutas(): RouteObject[] {
  return useContext(RutasContexto);
}
