/**
 * Cambia la zona horaria del proceso de Vitest (Node aplica `process.env.TZ` en caliente). Sirve para probar
 * que las horas no dependen de la zona del navegador. Devuelve cómo restaurar la anterior.
 */

// Sin @types/node: solo se necesita process.env.
const entorno = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

export function cambiarZona(zona: string): () => void {
  const anterior = entorno.TZ;
  entorno.TZ = zona;
  return () => {
    if (anterior === undefined) delete entorno.TZ;
    else entorno.TZ = anterior;
  };
}
