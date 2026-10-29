import { Link } from 'react-router';

export function NoEncontrada() {
  return (
    <main style={{ padding: 'var(--espacio-4)' }}>
      <h1>Página no encontrada</h1>
      <p>
        <Link to="/">Ir al inicio</Link>
      </p>
    </main>
  );
}
