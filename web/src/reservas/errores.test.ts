import { describe, expect, it } from 'vitest';
import { MENSAJES } from '../api/errores';
import { ErrorApi } from '../api/resultado';
import { erroresDelBackend, mensajeDeErrorApi, sinRespuesta } from './errores';
import { CAMPOS_DEL_MODO } from './formulario';

describe('errores 400 de DRF', () => {
  it('ubica cada mensaje en su campo, también los anidados', () => {
    const cuerpo = {
      pasajero: { telefono: ['Teléfono en formato E.164, p. ej. +56912345678.'] },
      recogida_en: ['La hora de recogida debe ser futura.'],
      origen_dir: ['El origen está fuera de la zona de operación de la empresa.'],
      vuelo: { numero: ['Número de vuelo IATA, p. ej. LA123 o H2 456.'], hora_programada: ['Fecha inválida.'] },
    };
    expect(erroresDelBackend(cuerpo, CAMPOS_DEL_MODO.crear)).toEqual({
      campos: {
        'pasajero.telefono': 'Teléfono en formato E.164, p. ej. +56912345678.',
        recogida: 'La hora de recogida debe ser futura.',
        origen_dir: 'El origen está fuera de la zona de operación de la empresa.',
        'vuelo.numero': 'Número de vuelo IATA, p. ej. LA123 o H2 456.',
        'vuelo.hora': 'Fecha inválida.',
      },
      generales: [],
    });
  });

  it('el error de vuelo sin anidar va al número de vuelo', () => {
    const cuerpo = { vuelo: ['El vuelo solo se registra en viajes desde el aeropuerto (llegadas).'] };
    expect(erroresDelBackend(cuerpo, CAMPOS_DEL_MODO.crear).campos).toEqual({
      'vuelo.numero': 'El vuelo solo se registra en viajes desde el aeropuerto (llegadas).',
    });
  });

  it('non_field_errors, detail, campos desconocidos y campos que el modo no muestra van al aviso general', () => {
    const cuerpo = {
      non_field_errors: ['Algo general.'],
      detail: 'Otro detalle.',
      tarifa: ['No va en el formulario.'],
      pasajero: { telefono: ['No se edita.'] },
    };
    expect(erroresDelBackend(cuerpo, CAMPOS_DEL_MODO.editar)).toEqual({
      campos: {},
      generales: ['Algo general.', 'Otro detalle.', 'No va en el formulario.', 'No se edita.'],
    });
  });

  it('un cuerpo vacío o raro da un mensaje genérico', () => {
    expect(erroresDelBackend(null, CAMPOS_DEL_MODO.crear).generales).toEqual([MENSAJES.inesperado]);
    expect(erroresDelBackend({ x: 3 }, CAMPOS_DEL_MODO.crear).generales).toEqual([MENSAJES.inesperado]);
  });
});

describe('mensajes de error', () => {
  it.each([
    [0, null, MENSAJES.sin_conexion],
    [502, '<html>', MENSAJES.sin_conexion],
    [504, null, MENSAJES.sin_conexion],
    [500, null, MENSAJES.error_servidor],
    [404, { detail: 'No encontrado.' }, 'No se encontró la reserva.'],
    [403, null, 'Tu rol no tiene acceso a esta acción.'],
    [401, null, MENSAJES.sesion_terminada],
    [409, { detail: 'Solo antes del despacho.' }, 'Solo antes del despacho.'],
    [409, null, 'La reserva no admite la operación en su estado actual.'],
    [418, { detail: 'Raro.' }, 'Raro.'],
    [418, { detail: 3 }, MENSAJES.inesperado],
  ])('%s → mensaje', (estado, cuerpo, mensaje) => {
    expect(mensajeDeErrorApi(new ErrorApi(estado, cuerpo))).toBe(mensaje);
  });

  it('un error que no es de la API', () => {
    expect(mensajeDeErrorApi(new Error('x'))).toBe(MENSAJES.inesperado);
  });

  it('sin respuesta: no se sabe si el POST se aplicó', () => {
    expect(sinRespuesta(new ErrorApi(0, null))).toBe(true);
    expect(sinRespuesta(new ErrorApi(503, null))).toBe(true);
    expect(sinRespuesta(new ErrorApi(500, null))).toBe(false);
    expect(sinRespuesta(new Error('x'))).toBe(false);
  });
});
