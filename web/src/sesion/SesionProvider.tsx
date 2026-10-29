import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { crearClienteApi, type ClienteApi } from '../api/cliente';
import type { Entorno } from './entorno';
import { crearSesion, type EstadoSesion, type Sesion } from './sesion';

interface ContextoSesion {
  sesion: Sesion;
  api: ClienteApi;
}

const Contexto = createContext<ContextoSesion | null>(null);

export function SesionProvider({ entorno, children }: { entorno: Entorno; children: ReactNode }) {
  const [valor] = useState(() => {
    const sesion = crearSesion(entorno);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Al limpiar la sesión no deben quedar datos de la anterior en caché.
    sesion.alLimpiar(() => queryClient.clear());
    return { sesion, api: crearClienteApi(entorno, sesion), queryClient };
  });
  useEffect(() => valor.sesion.conectar(), [valor]);
  return (
    <QueryClientProvider client={valor.queryClient}>
      <Contexto.Provider value={valor}>{children}</Contexto.Provider>
    </QueryClientProvider>
  );
}

function useContexto(): ContextoSesion {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('Falta <SesionProvider>.');
  return contexto;
}

export function useSesion(): { sesion: Sesion; estado: EstadoSesion } {
  const { sesion } = useContexto();
  const estado = useSyncExternalStore(sesion.suscribir, sesion.estado);
  return { sesion, estado };
}

export function useApi(): ClienteApi {
  return useContexto().api;
}

/** Refresh silencioso: solo lo usan las rutas del panel y /login. */
export function useIniciarSesion(): EstadoSesion {
  const { sesion, estado } = useSesion();
  useEffect(() => {
    void sesion.iniciar();
  }, [sesion]);
  return estado;
}
