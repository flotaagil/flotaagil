import { useOutletContext } from 'react-router';
import type { ClientePortal, EmpresaPublica } from './api';

/** Lo que el marco del portal entrega a sus páginas: el cliente de la API y la empresa ya cargada. */
export interface ContextoPortal {
  api: ClientePortal;
  empresa: EmpresaPublica;
  slug: string;
}

export function useContextoPortal(): ContextoPortal {
  return useOutletContext<ContextoPortal>();
}
