/** Portal público (HU-19, CP-07) con el backend falso, sin sesión, en varias zonas horarias. */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { App } from '../App';
import { MENSAJES } from '../api/errores';
import { crearEntorno, crearLocks } from '../pruebas/entornoFalso';
import { ServidorPortalFalso } from '../pruebas/servidorPortalFalso';
import { cambiarZona } from '../pruebas/zona';
import { crearRutas } from '../rutas/tabla';
import { MENSAJES_PORTAL } from './formulario';

const RUTA = '/solicitar/transportes-andes';

function montarPortal(ruta = RUTA, servidor = new ServidorPortalFalso()) {
  const locks = crearLocks();
  let canales = 0;
  const { entorno } = crearEntorno({ servidor, locks, ahora: servidor.ahora });
  entorno.crearCanal = () => {
    canales++;
    return null;
  };
  const rutas = crearRutas();
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(<App entorno={entorno} rutas={rutas} router={router} />);
  return { servidor, router, locks, canales: () => canales };
}

async function abrir(servidor = new ServidorPortalFalso()) {
  const contexto = montarPortal(RUTA, servidor);
  await screen.findByRole('heading', { name: 'Solicitar un viaje' });
  return contexto;
}

function fijarHora(etiqueta: RegExp, valor: string) {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
}

/** Llena lo obligatorio (viaje urbano, recogida a las 14:00 de Chile; ahora son las 12:00). */
async function llenar({ telefono = '+56 9 8765 4321', recogida = '2026-10-30T14:00' } = {}) {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Nombre'), 'Ana Turista');
  if (telefono) await usuario.type(screen.getByLabelText('WhatsApp'), telefono);
  await usuario.type(screen.getByLabelText('Dirección de origen'), 'Av. Providencia 1234');
  await usuario.type(screen.getByLabelText('Dirección de destino'), 'Plaza de Armas');
  if (recogida) fijarHora(/^Recogida/, recogida);
  await usuario.click(screen.getByLabelText('Acepto el aviso de privacidad.'));
  await usuario.click(screen.getByLabelText(/^Acepto recibir por WhatsApp/));
  return usuario;
}

const enviar = (usuario: ReturnType<typeof userEvent.setup>) =>
  usuario.click(screen.getByRole('button', { name: /Solicitar viaje|Enviar de nuevo/ }));

describe('carga del portal', () => {
  it('muestra la empresa, sin sesión: ni /api/auth/, ni Web Locks, ni canal entre pestañas', async () => {
    const { servidor, locks, canales } = await abrir();
    expect(within(screen.getByRole('banner')).getByText('Transportes Andes Demo SpA')).toBeInTheDocument();
    expect(document.title).toBe('Solicitar un viaje · Transportes Andes Demo SpA');
    expect(servidor.llamadas).toEqual(['GET /api/portal/transportes-andes/']);
    expect(servidor.prohibidas).toEqual([]);
    expect(locks.solicitudes).toBe(0);
    expect(canales()).toBe(0);
  });

  it('empresa inexistente o inactiva: página clara, sin formulario', async () => {
    montarPortal('/solicitar/no-existe');
    expect(await screen.findByRole('heading', { name: 'Esta página de solicitudes no está disponible' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Solicitar viaje' })).not.toBeInTheDocument();
  });

  it.each([
    ['red', 'No se pudo conectar con el servidor'],
    [503, 'No se pudo conectar con el servidor'],
    [500, 'El servidor tuvo un error'],
  ] as const)('falla al cargar (%s): «%s» y Reintentar', async (falla, titulo) => {
    const servidor = new ServidorPortalFalso();
    servidor.fallaEmpresa = falla;
    montarPortal(RUTA, servidor);
    expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument();
    servidor.fallaEmpresa = null;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Solicitar un viaje' })).toBeInTheDocument();
  });

  it('página de privacidad con la franja de texto provisional', async () => {
    montarPortal(`${RUTA}/privacidad`);
    expect(await screen.findByRole('heading', { name: 'Aviso de privacidad' })).toBeInTheDocument();
    expect(screen.getByText('Texto provisional, pendiente de aprobación.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al formulario' })).toHaveAttribute('href', RUTA);
  });
});

describe('formulario', () => {
  it('envía la solicitud y confirma con lo pedido y el plazo en hora de Chile, sin id', async () => {
    const { servidor } = await abrir();
    const usuario = await llenar();
    await enviar(usuario);
    const titulo = await screen.findByRole('heading', { name: 'Solicitud recibida' });
    expect(titulo).toHaveFocus();
    expect(servidor.cuerpos).toEqual([
      {
        nombre: 'Ana Turista',
        telefono: '+56987654321',
        sentido: 'URBANO',
        origen_dir: 'Av. Providencia 1234',
        destino_dir: 'Plaza de Armas',
        recogida_en: '2026-10-30T17:00:00.000Z',
        acepta_privacidad: true,
        acepta_whatsapp: true,
        sitio_web: '',
      },
    ]);
    expect(screen.getByText(/Confirma respondiendo el WhatsApp que enviamos al/)).toHaveTextContent(
      'Confirma respondiendo el WhatsApp que enviamos al +56 9 8765 4321 antes del vie 30-10-2026 12:15 (hora de Chile).',
    );
    expect(screen.getByText('vie 30-10-2026 14:00 (hora de Chile)')).toBeInTheDocument();
    expect(screen.queryByText(/#\d+|reserva n/i)).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Hacer otra solicitud' }));
    expect(screen.getByLabelText('Nombre')).toHaveValue('');
  });

  it('obligatorios y aceptaciones: no envía y explica cada campo', async () => {
    const { servidor } = await abrir();
    await enviar(userEvent.setup());
    expect(await screen.findByText('Ingresa tu nombre.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa tu número de WhatsApp.')).toBeInTheDocument();
    expect(screen.getAllByText('Ingresa la dirección.')).toHaveLength(2);
    expect(screen.getByText('Indica la fecha y hora de recogida.')).toBeInTheDocument();
    expect(screen.getByText('Debes aceptar el aviso de privacidad.')).toBeInTheDocument();
    expect(screen.getByText('Debes aceptar los avisos por WhatsApp para confirmar tu viaje.')).toBeInTheDocument();
    expect(servidor.cuerpos).toEqual([]);
  });

  it('el aviso de privacidad se lee junto al checkbox, con la franja provisional', async () => {
    await abrir();
    const desplegable = screen.getByText('Leer el aviso de privacidad').closest('details')!;
    expect(within(desplegable).getByText('Texto provisional, pendiente de aprobación.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Aviso de privacidad' })).toHaveAttribute('href', `${RUTA}/privacidad`);
  });

  it('anticipación mínima: antes de ahora + 30 min no se envía', async () => {
    const { servidor } = await abrir();
    expect(screen.getByText(/Ahora en Chile: vie 30-10-2026 12:00/)).toBeInTheDocument();
    const usuario = await llenar({ recogida: '2026-10-30T12:10' });
    await enviar(usuario);
    expect(
      await screen.findByText('Pide con al menos 30 minutos de anticipación: desde el vie 30-10-2026 12:30 (hora de Chile).'),
    ).toBeInTheDocument();
    expect(servidor.cuerpos).toEqual([]);
    expect(screen.getByLabelText(/^Recogida/)).toHaveAttribute('min', '2026-10-30T12:30');
  });

  it('campo trampa: fuera del árbol de accesibilidad y del tabulador, y se envía vacío', async () => {
    const { servidor } = await abrir();
    expect(screen.queryByRole('textbox', { name: 'Sitio web' })).not.toBeInTheDocument();
    const trampa = document.querySelector<HTMLInputElement>('input[name="sitio_web"]')!;
    expect(trampa.tabIndex).toBe(-1);
    expect(trampa.closest('[aria-hidden="true"]')).not.toBeNull();
    const usuario = await llenar();
    await enviar(usuario);
    await screen.findByRole('heading', { name: 'Solicitud recibida' });
    expect(servidor.cuerpos[0].sitio_web).toBe('');
  });
});

describe('teléfono de turistas', () => {
  it('un número extranjero con + se acepta tal cual, sin sugerencia', async () => {
    const { servidor } = await abrir();
    const usuario = await llenar({ telefono: '+51 987 654 321' });
    expect(screen.queryByRole('button', { name: /¿Es un celular de Chile?/ })).not.toBeInTheDocument();
    await enviar(usuario);
    await screen.findByRole('heading', { name: 'Solicitud recibida' });
    expect(servidor.cuerpos[0].telefono).toBe('+51987654321');
  });

  it('9 dígitos con 9 y sin +: sugiere +56 sin cambiar el valor; sin tocarla, pide el código de país', async () => {
    const { servidor } = await abrir();
    const usuario = await llenar({ telefono: '987654321' });
    const sugerencia = await screen.findByRole('button', { name: '¿Es un celular de Chile? Usar +56 9 8765 4321' });
    expect(screen.getByLabelText('WhatsApp')).toHaveValue('987654321');
    await enviar(usuario);
    expect(await screen.findByText('Incluye el código de país, por ejemplo +56 9… (Chile) o +51 9… (Perú).')).toBeInTheDocument();
    expect(servidor.cuerpos).toEqual([]);
    await usuario.click(sugerencia);
    expect(screen.getByLabelText('WhatsApp')).toHaveValue('+56987654321');
    await waitFor(() => expect(screen.queryByText(/Incluye el código de país, por ejemplo/)).not.toBeInTheDocument());
    await enviar(usuario);
    await screen.findByRole('heading', { name: 'Solicitud recibida' });
    expect(servidor.cuerpos[0].telefono).toBe('+56987654321');
  });
});

describe('vuelo', () => {
  it('solo aparece desde el aeropuerto; sin recogida explica «llegada + 20 min» y la confirmación la muestra calculada', async () => {
    const { servidor } = await abrir();
    expect(screen.queryByLabelText('Número de vuelo')).not.toBeInTheDocument();
    const usuario = await llenar({ recogida: '' });
    await usuario.click(screen.getByLabelText('Desde el aeropuerto (llego en un vuelo)'));
    await usuario.type(screen.getByLabelText('Número de vuelo'), 'la 845');
    fijarHora(/^Llegada del vuelo/, '2026-10-30T13:10');
    expect(screen.getByLabelText(/^Recogida/)).toHaveAccessibleName('Recogida (hora de Chile, opcional)');
    expect(screen.getByText(/la calculamos con la llegada de tu vuelo \+ 20 min/)).toBeInTheDocument();
    await enviar(usuario);
    await screen.findByRole('heading', { name: 'Solicitud recibida' });
    expect(servidor.cuerpos[0]).toMatchObject({ sentido: 'DESDE_AEROPUERTO', vuelo: { numero: 'LA 845', hora_llegada: '2026-10-30T16:10:00.000Z' } });
    expect(servidor.cuerpos[0]).not.toHaveProperty('recogida_en');
    expect(screen.getByText('vie 30-10-2026 13:30 (hora de Chile)')).toBeInTheDocument();
    expect(screen.getByText(/calculada con la llegada de tu vuelo/)).toBeInTheDocument();
  });

  it('si la llegada + margen queda antes del mínimo, pide una hora de recogida', async () => {
    const { servidor } = await abrir();
    const usuario = await llenar({ recogida: '' });
    await usuario.click(screen.getByLabelText('Desde el aeropuerto (llego en un vuelo)'));
    await usuario.type(screen.getByLabelText('Número de vuelo'), 'LA845');
    fijarHora(/^Llegada del vuelo/, '2026-10-30T12:00');
    await enviar(usuario);
    expect(
      await screen.findByText(/Con la llegada \+ 20 min la recogida quedaría el vie 30-10-2026 12:20\. Pide con al menos 30 minutos/),
    ).toBeInTheDocument();
    expect(servidor.cuerpos).toEqual([]);
  });

  it('con otro sentido el vuelo no se envía', async () => {
    const { servidor } = await abrir();
    const usuario = await llenar();
    await usuario.click(screen.getByLabelText('Desde el aeropuerto (llego en un vuelo)'));
    await usuario.type(screen.getByLabelText('Número de vuelo'), 'LA845');
    await usuario.click(screen.getByLabelText('Hacia el aeropuerto'));
    await enviar(usuario);
    await screen.findByRole('heading', { name: 'Solicitud recibida' });
    expect(servidor.cuerpos[0]).not.toHaveProperty('vuelo');
  });
});

describe.each(['UTC', 'Europe/Madrid', 'Asia/Tokyo'])('horas con el navegador en %s', (zona) => {
  let restaurar = () => {};
  beforeAll(() => {
    restaurar = cambiarZona(zona);
  });
  afterAll(() => restaurar());

  it('una hora inexistente (salto de septiembre) se rechaza y no se envía', async () => {
    const { servidor } = await abrir();
    const usuario = await llenar({ recogida: '2027-09-05T00:30' });
    expect(screen.getByText(/Esa hora no existe en Chile .*\(de 00:00 a 00:59 del 05-09-2027\)/)).toBeInTheDocument();
    await enviar(usuario);
    await waitFor(() => expect(screen.getByLabelText(/^Recogida/)).toHaveAttribute('aria-invalid', 'true'));
    expect(servidor.cuerpos).toEqual([]);
  });

  it('una hora repetida (abril): primera por defecto; con el selector, la segunda', async () => {
    const { servidor } = await abrir();
    const usuario = await llenar({ recogida: '2027-04-03T23:30' });
    expect(screen.getByText(/Se usará la/)).toHaveTextContent('Se usará la primera (UTC−3).');
    await usuario.click(screen.getByLabelText('segunda (UTC−4)'));
    await enviar(usuario);
    await screen.findByRole('heading', { name: 'Solicitud recibida' });
    expect(servidor.cuerpos[0].recogida_en).toBe('2027-04-04T03:30:00.000Z');
    expect(screen.getByText('sáb 03-04-2027 23:30 (UTC−4) (hora de Chile)')).toBeInTheDocument();
  });

  it('la recogida y el plazo se envían y se muestran en hora de Chile', async () => {
    const { servidor } = await abrir();
    const usuario = await llenar();
    await enviar(usuario);
    await screen.findByRole('heading', { name: 'Solicitud recibida' });
    expect(servidor.cuerpos[0].recogida_en).toBe('2026-10-30T17:00:00.000Z');
    expect(screen.getByText(/antes del/)).toHaveTextContent('vie 30-10-2026 12:15');
  });
});

describe('errores del envío', () => {
  it('400: cada mensaje en su campo, también los anidados; el foco al primero', async () => {
    const servidor = new ServidorPortalFalso();
    servidor.siguiente({
      estado: 400,
      cuerpo: {
        telefono: ['Teléfono en formato E.164, p. ej. +56912345678.'],
        recogida_en: ['La recogida debe ser al menos 30 minutos después de ahora.'],
        acepta_whatsapp: ['Debes aceptar los avisos por WhatsApp para confirmar tu viaje.'],
        non_field_errors: ['Revisa los datos.'],
      },
    });
    await abrir(servidor);
    const usuario = await llenar();
    await enviar(usuario);
    expect(await screen.findByText('Teléfono en formato E.164, p. ej. +56912345678.')).toBeInTheDocument();
    expect(screen.getByText('La recogida debe ser al menos 30 minutos después de ahora.')).toBeInTheDocument();
    expect(screen.getByText('Debes aceptar los avisos por WhatsApp para confirmar tu viaje.')).toBeInTheDocument();
    expect(screen.getByText('Revisa los datos.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('WhatsApp')).toHaveFocus());
  });

  it('400 del vuelo anidado (hora_llegada) va a la llegada', async () => {
    const servidor = new ServidorPortalFalso();
    servidor.siguiente({ estado: 400, cuerpo: { vuelo: { hora_llegada: ['Fecha inválida.'] } } });
    await abrir(servidor);
    const usuario = await llenar();
    await usuario.click(screen.getByLabelText('Desde el aeropuerto (llego en un vuelo)'));
    await usuario.type(screen.getByLabelText('Número de vuelo'), 'LA845');
    fijarHora(/^Llegada del vuelo/, '2026-10-30T13:10');
    await enviar(usuario);
    expect(await screen.findByText('Fecha inválida.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Llegada del vuelo/)).toHaveAttribute('aria-invalid', 'true');
  });

  it.each([
    [{ detail: 'Se enviaron demasiadas solicitudes…', code: 'limite_ip' }, MENSAJES_PORTAL.limite_ip],
    [{ detail: 'Ya enviaste varias…', code: 'limite_telefono' }, MENSAJES_PORTAL.limite_telefono],
    [{ detail: 'Solicitud fue regulada (throttled).' }, 'Solicitud fue regulada (throttled).'],
  ])('429 %o: mensaje según el code', async (cuerpo, mensaje) => {
    const servidor = new ServidorPortalFalso();
    servidor.siguiente({ estado: 429, cuerpo });
    await abrir(servidor);
    await enviar(await llenar());
    expect(await screen.findByText(mensaje)).toBeInTheDocument();
  });

  it.each([['red'], [500], [504]] as const)(
    'sin respuesta (%s): «No sabemos si llegó»; reenviar pide confirmación',
    async (falla) => {
      const servidor = new ServidorPortalFalso();
      servidor.siguiente({ estado: falla });
      await abrir(servidor);
      const usuario = await llenar();
      await enviar(usuario);
      expect(await screen.findByText(MENSAJES_PORTAL.incierto)).toBeInTheDocument();
      // Reenviar no sale sin confirmar.
      await usuario.click(screen.getByRole('button', { name: 'Enviar de nuevo' }));
      const dialogo = screen.getByRole('alertdialog');
      expect(dialogo).toHaveTextContent('quedará duplicada');
      await usuario.click(within(dialogo).getByRole('button', { name: 'Esperar el WhatsApp' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(servidor.cuerpos).toHaveLength(1);
      await usuario.click(screen.getByRole('button', { name: 'Enviar de nuevo' }));
      await usuario.click(screen.getByRole('button', { name: 'Sí, enviar de nuevo' }));
      await screen.findByRole('heading', { name: 'Solicitud recibida' });
      expect(servidor.cuerpos).toHaveLength(2);
    },
  );

  it('404 al enviar (la empresa se desactivó): página de no disponible', async () => {
    const servidor = new ServidorPortalFalso();
    servidor.siguiente({ estado: 404, cuerpo: { detail: 'No encontrado.' } });
    await abrir(servidor);
    await enviar(await llenar());
    expect(await screen.findByRole('heading', { name: 'Esta página de solicitudes no está disponible' })).toBeInTheDocument();
  });

  it('otro error muestra su detail', async () => {
    const servidor = new ServidorPortalFalso();
    servidor.siguiente({ estado: 415, cuerpo: { detail: 'Tipo de medio no soportado.' } });
    await abrir(servidor);
    await enviar(await llenar());
    expect(await screen.findByText('Tipo de medio no soportado.')).toBeInTheDocument();
  });

  it('mientras se envía, el botón se desactiva (sin doble envío)', async () => {
    const servidor = new ServidorPortalFalso();
    servidor.retenerEnvios = true;
    await abrir(servidor);
    const usuario = await llenar();
    await enviar(usuario);
    expect(await screen.findByRole('button', { name: 'Enviando…' })).toBeDisabled();
    await act(async () => servidor.entregar());
    await screen.findByRole('heading', { name: 'Solicitud recibida' });
    expect(servidor.cuerpos).toHaveLength(1);
  });
});

describe('fuera del portal', () => {
  it('la página no encontrada tampoco carga la sesión', async () => {
    const { servidor, locks } = montarPortal('/no/existe');
    expect(await screen.findByText('Página no encontrada')).toBeInTheDocument();
    expect(servidor.llamadas).toEqual([]);
    expect(locks.solicitudes).toBe(0);
    expect(MENSAJES.sin_conexion).toBeTruthy();
  });
});
