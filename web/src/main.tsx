import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { App } from './App';
import { crearRutas } from './rutas/tabla';
import { entornoDelNavegador } from './sesion/entorno';
import './estilos/tokens.css';
import './estilos/global.css';

const rutas = crearRutas();
const router = createBrowserRouter(rutas);

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App entorno={entornoDelNavegador()} rutas={rutas} router={router} />
  </StrictMode>,
);
