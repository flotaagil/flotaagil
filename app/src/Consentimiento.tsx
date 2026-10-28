import { registrarConsentimiento } from './consentimiento-estado';

/** Pantalla de consentimiento informado (RN-18), antes de la primera sesión. */
export function Consentimiento({ alAceptar }: { alAceptar: () => void }) {
  const aceptar = () => {
    registrarConsentimiento();
    alAceptar();
  };

  return (
    <main>
      <h1>Uso de tu ubicación</h1>
      <p>Esta versión de prueba (H-3) registra tu ubicación para medir el funcionamiento del GPS.</p>
      <ul>
        <li><strong>Qué se registra:</strong> posición, precisión, velocidad, rumbo, nivel de batería y la hora.</li>
        <li><strong>Cuándo:</strong> solo mientras haya una sesión iniciada. Verás una notificación fija mientras dure.</li>
        <li><strong>Dónde se guarda:</strong> solo en este teléfono. No se envía a ningún servidor.</li>
        <li><strong>Cómo se comparte:</strong> únicamente si tú exportas los archivos CSV.</li>
        <li><strong>Cómo detenerlo:</strong> con «Detener sesión». Puedes borrar todo desde la app.</li>
      </ul>
      <p>Android te pedirá permiso de ubicación y de notificaciones al iniciar la primera sesión.</p>
      <button className="principal" onClick={aceptar}>Acepto</button>
    </main>
  );
}
