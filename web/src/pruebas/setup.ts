import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Las pantallas llegan con lazy (raíz de sesión → RutaAutenticada → Layout → pantalla): la primera carga de
// cada cadena transforma esos módulos, y con toda la suite y la cobertura corriendo en paralelo puede pasar
// del segundo que espera Testing Library por defecto.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => cleanup());
