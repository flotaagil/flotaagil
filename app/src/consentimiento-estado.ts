const CLAVE = 'flotaagil.consentimiento-gps';

/** RN-18: la ubicación se registra solo en turno y con consentimiento informado. */
export function consentimientoAceptado(): boolean {
  try {
    return localStorage.getItem(CLAVE) !== null;
  } catch {
    return false;
  }
}

export function registrarConsentimiento(): void {
  try {
    localStorage.setItem(CLAVE, new Date().toISOString());
  } catch {
    // Sin almacenamiento se vuelve a pedir en la próxima apertura.
  }
}
