/**
 * Teléfono del pasajero en el portal. A diferencia del panel acepta números de cualquier país (turistas), así
 * que nunca se completa solo: un número de 9 dígitos que empieza con 9 es un celular chileno sin prefijo, pero
 * también el formato de los celulares de Perú y de los fijos de España. En ese caso se ofrece una sugerencia de
 * un toque («¿Es un celular de Chile? Usar +56 9 …») y el valor no cambia hasta que la persona la acepta.
 */

const E164 = /^\+[1-9]\d{7,14}$/;

/** «+56 9 1234-5678» → «+56912345678» (igual que normalizar_telefono del backend). */
export function normalizarTelefono(valor: string): string {
  return [...valor].filter((c) => /\d/.test(c) || c === '+').join('');
}

/** Sugerencia +56 para un celular chileno escrito sin prefijo; null si no aplica. */
export function sugerenciaChile(valor: string): string | null {
  if (valor.includes('+')) return null;
  const digitos = valor.replace(/[\s\-().]/g, '');
  return /^9\d{8}$/.test(digitos) ? `+56${digitos}` : null;
}

/** «+56987654321» → «+56 9 8765 4321» (para mostrar); otros números quedan igual. */
export function mostrarTelefono(e164: string): string {
  const chileno = /^\+569(\d{4})(\d{4})$/.exec(e164);
  return chileno ? `+56 9 ${chileno[1]} ${chileno[2]}` : e164;
}

/** Mensaje de error, o null si el teléfono es válido. */
export function errorTelefono(valor: string): string | null {
  if (!valor.trim()) return 'Ingresa tu número de WhatsApp.';
  const numero = normalizarTelefono(valor);
  if (!numero.startsWith('+')) {
    return 'Incluye el código de país, por ejemplo +56 9… (Chile) o +51 9… (Perú).';
  }
  return E164.test(numero) ? null : 'Número en formato internacional, p. ej. +56 9 1234 5678.';
}
