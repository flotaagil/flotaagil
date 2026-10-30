/**
 * Errores 400 con el formato de DRF (no están en el OpenAPI): `{campo: [mensajes]}`, anidado en objetos
 * (`pasajero`, `vuelo`), más `non_field_errors` o `detail`. Los mensajes llegan en español y se muestran tal
 * cual en su campo; lo que no corresponde a un campo del formulario va a un aviso general.
 */

import { MENSAJES } from './errores';

export interface ErroresFormulario {
  campos: Record<string, string>;
  generales: string[];
}

function textos(valor: unknown): string[] | null {
  if (typeof valor === 'string') return [valor];
  if (Array.isArray(valor) && valor.every((v) => typeof v === 'string')) return valor as string[];
  return null;
}

/**
 * Aplana el cuerpo de un 400. `mapa`: ruta en la API («vuelo.hora_llegada») → campo del formulario
 * («vuelo.hora»). `permitidos`: campos que el formulario muestra en este momento (el resto, a generales).
 */
export function erroresDelBackend(
  cuerpo: unknown,
  mapa: Record<string, string>,
  permitidos: readonly string[],
): ErroresFormulario {
  const resultado: ErroresFormulario = { campos: {}, generales: [] };
  function recorrer(valor: unknown, ruta: string) {
    const lista = textos(valor);
    if (lista) {
      const campo = mapa[ruta];
      if (campo && permitidos.includes(campo) && !resultado.campos[campo]) resultado.campos[campo] = lista.join(' ');
      else resultado.generales.push(...lista);
      return;
    }
    if (valor && typeof valor === 'object') {
      for (const [clave, interno] of Object.entries(valor)) {
        const general = clave === 'non_field_errors' || clave === 'detail';
        recorrer(interno, general ? `${ruta}#general` : ruta ? `${ruta}.${clave}` : clave);
      }
    }
  }
  recorrer(cuerpo, '');
  if (!Object.keys(resultado.campos).length && !resultado.generales.length) {
    resultado.generales.push(MENSAJES.inesperado);
  }
  return resultado;
}
