/** Resultado de una llamada de openapi-fetch: los datos, o un ErrorApi con el estado y el cuerpo del error. */

/** Error de una llamada: `estado` 0 = no hubo respuesta (falla de red). `cuerpo` = JSON del error, si vino. */
export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    readonly cuerpo: unknown,
  ) {
    super(`HTTP ${estado}`);
  }
}

export async function resultado<T>(llamada: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let respuesta: Awaited<typeof llamada>;
  try {
    respuesta = await llamada;
  } catch {
    throw new ErrorApi(0, null);
  }
  if (respuesta.response.ok && respuesta.data !== undefined) return respuesta.data;
  throw new ErrorApi(respuesta.response.status, respuesta.error ?? null);
}

/** Sin respuesta del backend (red, o el proxy no lo alcanza): no se sabe si un POST se aplicó. */
export function sinRespuesta(error: unknown): boolean {
  return error instanceof ErrorApi && [0, 502, 503, 504].includes(error.estado);
}

/** `detail` del cuerpo de un error, si vino. */
export function detalleDe(error: unknown): string | null {
  if (error instanceof ErrorApi && error.cuerpo && typeof error.cuerpo === 'object' && 'detail' in error.cuerpo) {
    const { detail } = error.cuerpo;
    return typeof detail === 'string' ? detail : null;
  }
  return null;
}

/** `code` del cuerpo de un error, si vino. */
export function codigoDe(error: unknown): string | null {
  if (error instanceof ErrorApi && error.cuerpo && typeof error.cuerpo === 'object' && 'code' in error.cuerpo) {
    const { code } = error.cuerpo;
    return typeof code === 'string' ? code : null;
  }
  return null;
}
