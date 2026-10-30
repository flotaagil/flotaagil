import estilos from './portal.module.css';

/**
 * Aviso de privacidad del portal. **Texto provisional, pendiente de aprobación (PR-04)**: es un borrador para
 * que el formulario funcione; no hay un texto aprobado. Es la única fuente: lo usan el desplegable junto a la
 * aceptación y la página /solicitar/:slug/privacidad.
 */

export function FranjaProvisional() {
  return (
    <p className={estilos.franja} role="note">
      Texto provisional, pendiente de aprobación.
    </p>
  );
}

export function TextoPrivacidad({ razonSocial }: { razonSocial: string }) {
  return (
    <div className={estilos.textoLegal}>
      <FranjaProvisional />
      <p>
        <strong>{razonSocial}</strong> trata los datos que ingresas en este formulario para gestionar tu viaje.
      </p>
      <h3>Qué datos usamos</h3>
      <p>Tu nombre, tu número de WhatsApp, las direcciones de origen y destino, la fecha y hora de recogida y, si corresponde, tu vuelo.</p>
      <h3>Para qué</h3>
      <p>
        Para confirmar tu solicitud, asignarte un conductor y avisarte por WhatsApp del estado de tu viaje (por ejemplo,
        cuando el conductor va en camino o llegó). No usamos tus datos para publicidad.
      </p>
      <h3>Con quién los compartimos</h3>
      <p>
        Con el conductor asignado (nombre, teléfono y direcciones) y con el proveedor que envía los mensajes de WhatsApp,
        solo para enviarlos.
      </p>
      <h3>Cuánto tiempo</h3>
      <p>Los datos del viaje se guardan 24 meses y los mensajes de WhatsApp, 12 meses. Después se eliminan.</p>
      <h3>Tus derechos</h3>
      <p>
        Puedes pedir acceso, rectificación o eliminación de tus datos a {razonSocial}, según la normativa chilena de
        protección de datos personales.
      </p>
    </div>
  );
}
