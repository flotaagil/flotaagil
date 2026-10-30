import { Link } from 'react-router';

/** Un id inexistente o de otra empresa: el backend responde 404 en ambos casos (RN-13). */
export function NoEncontradaReserva() {
  return (
    <section>
      <h1>Reserva no encontrada</h1>
      <p>No existe o no pertenece a tu empresa.</p>
      <Link to="/reservas">Volver a las reservas</Link>
    </section>
  );
}
