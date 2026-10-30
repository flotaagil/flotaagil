import { useParams } from 'react-router';

/** Id numérico de la ruta (/reservas/:id); null si no es un número (no se hace la petición). */
export function useIdDeRuta(): number | null {
  const { id } = useParams();
  return id && /^[1-9]\d{0,9}$/.test(id) ? Number(id) : null;
}
