import type { ReactNode } from 'react';
import estilos from './Aviso.module.css';

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'error'; children: ReactNode }) {
  return (
    <p className={`${estilos.aviso} ${estilos[tipo]}`} role={tipo === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
