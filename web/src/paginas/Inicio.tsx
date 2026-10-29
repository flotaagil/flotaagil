import { useSesion } from '../sesion/SesionProvider';

export function Inicio() {
  const { estado } = useSesion();
  if (estado.fase !== 'autenticada') return null;
  return (
    <section>
      <h1>Inicio</h1>
      <p>Hola, {estado.usuario.nombre}.</p>
      <p>Panel de {estado.usuario.empresa.razon_social}.</p>
    </section>
  );
}
