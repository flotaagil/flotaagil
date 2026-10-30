import { Link } from 'react-router';
import { useContextoPortal } from '../contexto';
import { TextoPrivacidad } from '../Privacidad';
import estilos from '../portal.module.css';

export function Privacidad() {
  const { empresa, slug } = useContextoPortal();
  return (
    <section className={estilos.tarjeta}>
      <h1>Aviso de privacidad</h1>
      <TextoPrivacidad razonSocial={empresa.razon_social} />
      <Link to={`/solicitar/${slug}`} className={estilos.botonSecundario}>
        Volver al formulario
      </Link>
    </section>
  );
}
