import { describe, expect, it } from 'vitest';
import { ErrorApi } from '../api/resultado';
import { clasificarFalla, cuerpoSolicitud, MENSAJES_PORTAL, VALORES_INICIALES } from './formulario';
import { errorTelefono, mostrarTelefono, normalizarTelefono, sugerenciaChile } from './telefono';

describe('teléfono del portal (turistas)', () => {
  it.each([
    ['987654321', '+56987654321'],
    ['9 8765 4321', '+56987654321'],
    ['9-8765-4321', '+56987654321'],
  ])('«%s» sin prefijo: sugiere %s (no lo cambia solo)', (valor, sugerido) => {
    expect(sugerenciaChile(valor)).toBe(sugerido);
    expect(errorTelefono(valor)).toBe('Incluye el código de país, por ejemplo +56 9… (Chile) o +51 9… (Perú).');
  });

  it.each(['+51987654321', '+56987654321', '812345678', '98765432', '9876543210', ''])('«%s»: sin sugerencia', (valor) => {
    expect(sugerenciaChile(valor)).toBeNull();
  });

  it.each(['+51 987 654 321', '+34 912 345 678', '+1 (415) 555-0100', '+56 9 8765 4321'])('«%s»: número internacional válido', (valor) => {
    expect(errorTelefono(valor)).toBeNull();
  });

  it('errores', () => {
    expect(errorTelefono('  ')).toBe('Ingresa tu número de WhatsApp.');
    expect(errorTelefono('+0123')).toBe('Número en formato internacional, p. ej. +56 9 1234 5678.');
    expect(errorTelefono('12345678')).toContain('Incluye el código de país');
  });

  it('normaliza como el backend y muestra los celulares chilenos agrupados', () => {
    expect(normalizarTelefono('+51 (987) 654-321')).toBe('+51987654321');
    expect(mostrarTelefono('+56987654321')).toBe('+56 9 8765 4321');
    expect(mostrarTelefono('+51987654321')).toBe('+51987654321');
  });
});

describe('envío', () => {
  it('cuerpo: recorta, normaliza y siempre lleva sitio_web; sin recogida ni vuelo si no se informan', () => {
    const cuerpo = cuerpoSolicitud({
      ...VALORES_INICIALES,
      nombre: ' Ana ',
      telefono: '+51 987 654 321',
      origen_dir: ' A ',
      destino_dir: 'B',
      sentido: 'HACIA_AEROPUERTO',
      recogida: { pared: '2026-10-30T14:00', ocurrencia: 'primera' },
      vuelo: { numero: 'la 1', hora: { pared: '', ocurrencia: 'primera' } },
      acepta_privacidad: true,
      acepta_whatsapp: true,
    });
    expect(cuerpo).toEqual({
      nombre: 'Ana',
      telefono: '+51987654321',
      sentido: 'HACIA_AEROPUERTO',
      origen_dir: 'A',
      destino_dir: 'B',
      recogida_en: '2026-10-30T17:00:00.000Z',
      acepta_privacidad: true,
      acepta_whatsapp: true,
      sitio_web: '',
    });
  });

  it.each([
    [new ErrorApi(0, null), { tipo: 'incierto' }],
    [new ErrorApi(500, null), { tipo: 'incierto' }],
    [new ErrorApi(502, '<html>'), { tipo: 'incierto' }],
    [new ErrorApi(400, { nombre: ['x'] }), { tipo: 'campos', cuerpo: { nombre: ['x'] } }],
    [new ErrorApi(404, { detail: 'No encontrado.' }), { tipo: 'no_disponible' }],
    [new ErrorApi(429, { detail: 'x', code: 'limite_ip' }), { tipo: 'limite', mensaje: MENSAJES_PORTAL.limite_ip }],
    [new ErrorApi(429, { detail: 'x', code: 'limite_telefono' }), { tipo: 'limite', mensaje: MENSAJES_PORTAL.limite_telefono }],
    [new ErrorApi(429, { detail: 'Espera 42 segundos.' }), { tipo: 'limite', mensaje: 'Espera 42 segundos.' }],
    [new ErrorApi(429, null), { tipo: 'limite', mensaje: MENSAJES_PORTAL.limite_ip }],
    [new ErrorApi(415, { detail: 'Tipo no soportado.' }), { tipo: 'otro', mensaje: 'Tipo no soportado.' }],
    [new ErrorApi(418, null), { tipo: 'otro', mensaje: MENSAJES_PORTAL.inesperado }],
    [new Error('x'), { tipo: 'otro', mensaje: MENSAJES_PORTAL.inesperado }],
  ])('%s → %o', (error, esperado) => {
    expect(clasificarFalla(error)).toEqual(esperado);
  });
});
