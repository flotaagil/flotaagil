import { describe, expect, it } from 'vitest';
import { viajeDePrueba } from '../pruebas/servidorViajesFalso';
import {
  completarTelefono,
  cuerpoCrear,
  cuerpoEditar,
  esquemaReserva,
  normalizarTelefono,
  VALORES_NUEVA,
  valoresDeViaje,
  type ValoresReserva,
} from './formulario';

const validos: ValoresReserva = {
  ...VALORES_NUEVA,
  pasajero: { nombre: ' Pía Pasajera ', telefono: '+56 9 1234-5678' },
  origen_dir: ' Av. Siempre Viva 123 ',
  destino_dir: 'Aeropuerto SCL',
  sentido: 'HACIA_AEROPUERTO',
  recogida: { pared: '2026-11-02T10:00', ocurrencia: 'primera' },
};

function errores(valores: ValoresReserva, modo: 'crear' | 'editar' = 'crear') {
  const resultado = esquemaReserva(modo).safeParse(valores);
  return resultado.success ? {} : Object.fromEntries(resultado.error.issues.map((i) => [i.path.join('.'), i.message]));
}

describe('teléfono', () => {
  it.each([
    ['912345678', '+56912345678'],
    ['9 1234 5678', '+56912345678'],
    ['9-1234-5678', '+56912345678'],
    [' 912345678 ', '+56912345678'],
  ])('«%s» (9 dígitos que empiezan con 9) se completa a %s', (valor, completo) => {
    expect(completarTelefono(valor)).toBe(completo);
  });

  it.each(['812345678', '91234567', '9123456789', '56912345678', '+56912345678', '+5491123456789', 'abc', ''])(
    '«%s» queda igual (se exige en E.164)',
    (valor) => {
      expect(completarTelefono(valor)).toBe(valor);
    },
  );

  it('se valida en E.164 con la normalización del backend', () => {
    expect(normalizarTelefono('+56 (9) 1234-5678')).toBe('+56912345678');
    expect(errores({ ...validos, pasajero: { nombre: 'X', telefono: '812345678' } })['pasajero.telefono']).toBe(
      'Teléfono en formato E.164, p. ej. +56912345678.',
    );
    expect(errores({ ...validos, pasajero: { nombre: 'X', telefono: '+5491123456789' } })).toEqual({});
  });
});

describe('validación', () => {
  it('un formulario completo es válido', () => {
    expect(errores(validos)).toEqual({});
  });

  it('campos obligatorios', () => {
    expect(errores(VALORES_NUEVA)).toEqual({
      'pasajero.nombre': 'Ingresa el nombre del pasajero.',
      'pasajero.telefono': 'Teléfono en formato E.164, p. ej. +56912345678.',
      origen_dir: 'Ingresa la dirección de origen.',
      destino_dir: 'Ingresa la dirección de destino.',
      recogida: 'Ingresa la fecha y hora de recogida.',
    });
  });

  it('largos máximos', () => {
    const largo = { ...validos, pasajero: { nombre: 'x'.repeat(81), telefono: '+56912345678' }, origen_dir: 'x'.repeat(201) };
    expect(errores(largo)).toEqual({ 'pasajero.nombre': 'Máximo 80 caracteres.', origen_dir: 'Máximo 200 caracteres.' });
  });

  it('la hora inexistente se rechaza con el mensaje claro', () => {
    expect(errores({ ...validos, recogida: { pared: '2026-09-06T00:30', ocurrencia: 'primera' } }).recogida).toContain(
      'no existe en Chile',
    );
  });

  it('al editar no se valida el pasajero (no se edita)', () => {
    expect(errores({ ...validos, pasajero: { nombre: '', telefono: '' } }, 'editar')).toEqual({});
  });

  it('vuelo: solo se valida con DESDE_AEROPUERTO; es opcional pero va completo', () => {
    const desde = { ...validos, sentido: 'DESDE_AEROPUERTO' as const };
    const hora = { pared: '2026-11-02T09:15', ocurrencia: 'primera' as const };
    expect(errores(desde)).toEqual({});
    expect(errores({ ...desde, vuelo: { numero: 'la 123', hora } })).toEqual({});
    expect(errores({ ...desde, vuelo: { numero: 'LA12345', hora } })).toEqual({ 'vuelo.numero': 'Número de vuelo IATA, p. ej. LA123 o H2 456.' });
    expect(errores({ ...desde, vuelo: { numero: '', hora } })).toEqual({ 'vuelo.numero': 'Ingresa el número del vuelo.' });
    expect(errores({ ...desde, vuelo: { numero: 'LA123', hora: { pared: '', ocurrencia: 'primera' } } })).toEqual({
      'vuelo.hora': 'Ingresa la hora programada de llegada.',
    });
    expect(errores({ ...desde, vuelo: { numero: 'LA123', hora: { pared: '2026-09-06T00:15', ocurrencia: 'primera' } } })['vuelo.hora']).toContain('no existe');
    // Con otro sentido, un vuelo a medio llenar no molesta: no se envía.
    expect(errores({ ...validos, vuelo: { numero: 'xx', hora: { pared: '', ocurrencia: 'primera' } } })).toEqual({});
  });
});

describe('cuerpo para la API', () => {
  it('crear: recorta, normaliza el teléfono y envía la recogida en UTC', () => {
    expect(cuerpoCrear(validos)).toEqual({
      pasajero: { nombre: 'Pía Pasajera', telefono: '+56912345678' },
      canal: 'TELEFONO',
      sentido: 'HACIA_AEROPUERTO',
      origen_dir: 'Av. Siempre Viva 123',
      destino_dir: 'Aeropuerto SCL',
      recogida_en: '2026-11-02T13:00:00.000Z',
    });
  });

  it('crear: el vuelo solo va con DESDE_AEROPUERTO y si tiene número', () => {
    const vuelo = { numero: 'la  123', hora: { pared: '2026-04-04T23:30', ocurrencia: 'segunda' as const } };
    expect(cuerpoCrear({ ...validos, sentido: 'DESDE_AEROPUERTO', vuelo }).vuelo).toEqual({
      numero: 'LA 123',
      hora_programada: '2026-04-05T03:30:00.000Z',
    });
    expect(cuerpoCrear({ ...validos, sentido: 'URBANO', vuelo })).not.toHaveProperty('vuelo');
    expect(cuerpoCrear({ ...validos, sentido: 'DESDE_AEROPUERTO' })).not.toHaveProperty('vuelo');
  });

  it('editar: solo los campos modificados', () => {
    const valores = { ...validos, sentido: 'DESDE_AEROPUERTO' as const };
    expect(cuerpoEditar(valores, {})).toEqual({});
    expect(cuerpoEditar(valores, { destino_dir: true })).toEqual({ destino_dir: 'Aeropuerto SCL' });
    expect(cuerpoEditar(valores, { recogida: { ocurrencia: true } })).toEqual({ recogida_en: '2026-11-02T13:00:00.000Z' });
    expect(cuerpoEditar(valores, { recogida: true })).toEqual({ recogida_en: '2026-11-02T13:00:00.000Z' });
    expect(cuerpoEditar(valores, { recogida: { pared: false, ocurrencia: false } })).toEqual({});
    expect(cuerpoEditar(valores, { sentido: true, origen_dir: true })).toEqual({
      sentido: 'DESDE_AEROPUERTO',
      origen_dir: 'Av. Siempre Viva 123',
    });
  });

  it('editar: el vuelo va solo si se tocó; vaciarlo lo quita (null); con otro sentido no se envía', () => {
    const conVuelo = { ...validos, sentido: 'DESDE_AEROPUERTO' as const, vuelo: { numero: 'H2 456', hora: { pared: '2026-11-02T09:00', ocurrencia: 'primera' as const } } };
    expect(cuerpoEditar(conVuelo, { vuelo: { numero: true } })).toEqual({
      vuelo: { numero: 'H2 456', hora_programada: '2026-11-02T12:00:00.000Z' },
    });
    expect(cuerpoEditar({ ...conVuelo, vuelo: { numero: '', hora: { pared: '', ocurrencia: 'primera' } } }, { vuelo: { numero: true, hora: { pared: true } } })).toEqual({
      vuelo: null,
    });
    expect(cuerpoEditar({ ...conVuelo, sentido: 'URBANO' }, { sentido: true, vuelo: { numero: true } })).toEqual({ sentido: 'URBANO' });
  });

  it('valores iniciales al editar: conservan la ocurrencia de una hora repetida', () => {
    const viaje = viajeDePrueba({
      canal: 'WEB',
      sentido: 'DESDE_AEROPUERTO',
      recogida_en: '2026-04-05T03:30:00Z',
      vuelo: { numero: 'LA123', fecha: '2026-04-04', hora_programada: '2026-04-05T02:45:00Z', hora_estimada: null, estado_vuelo: 'PROGRAMADO' },
    });
    expect(valoresDeViaje(viaje)).toMatchObject({
      canal: 'TELEFONO',
      recogida: { pared: '2026-04-04T23:30', ocurrencia: 'segunda' },
      vuelo: { numero: 'LA123', hora: { pared: '2026-04-04T23:45', ocurrencia: 'primera' } },
    });
    expect(valoresDeViaje(viajeDePrueba({ canal: 'WHATSAPP', sentido: undefined })).canal).toBe('WHATSAPP');
  });
});
