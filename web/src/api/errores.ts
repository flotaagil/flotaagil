/** Mensajes para el usuario según el `code` del backend (o el estado HTTP si no viene). */

export const MENSAJES = {
  credenciales_invalidas: 'Correo o contraseña incorrectos.',
  cuenta_bloqueada: 'Tu cuenta está bloqueada temporalmente por intentos fallidos. Intenta más tarde.',
  cuenta_deshabilitada: 'Tu cuenta está deshabilitada. Contacta al administrador de tu empresa.',
  rol_no_permitido: 'Esta cuenta es de conductor: ingresa desde la app del conductor.',
  origen_no_permitido: 'No se pudo validar el origen de la página. Recarga e intenta de nuevo.',
  throttled: 'Demasiados intentos. Espera un momento e intenta de nuevo.',
  sesion_terminada: 'Tu sesión terminó. Inicia sesión de nuevo.',
  logout_no_confirmado: 'No se pudo confirmar el cierre de sesión en el servidor.',
  sin_conexion: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
  error_servidor: 'El servidor tuvo un error. Intenta de nuevo en un momento.',
  inesperado: 'Ocurrió un error inesperado. Intenta de nuevo.',
} as const;

export type CodigoMensaje = keyof typeof MENSAJES;

/** El backend devuelve `{detail, code}` en los errores de autenticación. */
export async function leerCodigo(respuesta: Response): Promise<string | null> {
  try {
    const datos: unknown = await respuesta.clone().json();
    if (datos && typeof datos === 'object' && 'code' in datos && typeof datos.code === 'string') {
      return datos.code;
    }
  } catch {
    // Cuerpo vacío o no JSON.
  }
  return null;
}

export function mensajeDeError(codigo: string | null, estado: number): string {
  if (codigo === 'sesion_invalida' || codigo === 'sesion_expirada') return MENSAJES.sesion_terminada;
  if (codigo && codigo in MENSAJES) return MENSAJES[codigo as CodigoMensaje];
  if (estado === 429) return MENSAJES.throttled;
  return MENSAJES.inesperado;
}

/**
 * Falla sin respuesta útil del backend. «red»: no se pudo conectar (sin red, o el proxy no lo alcanza: 502, 503,
 * 504). «servidor»: el backend respondió con un error (500 u otro estado inesperado).
 */
export type MotivoFalla = 'red' | 'servidor';

export function motivoDeFalla(estado: number): MotivoFalla {
  return estado === 502 || estado === 503 || estado === 504 ? 'red' : 'servidor';
}
