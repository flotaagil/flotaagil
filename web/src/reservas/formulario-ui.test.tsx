/** Crear y editar reservas (CP-05) desde la interfaz, con el servidor falso. */

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MENSAJES } from '../api/errores';
import { consultasDelListado, esperarListado, montarPanel } from '../pruebas/montar';
import { viajeDePrueba } from '../pruebas/servidorViajesFalso';
import { cambiarZona } from '../pruebas/zona';

async function abrirNueva() {
  const contexto = montarPanel('/reservas/nueva');
  await screen.findByRole('heading', { name: 'Nueva reserva' });
  return contexto;
}

function fijarHora(etiqueta: string, valor: string) {
  // datetime-local en jsdom: se fija el valor completo (escribir carácter a carácter lo invalida).
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
}

async function llenarBasico(usuario = userEvent.setup(), telefono = '912345678') {
  await usuario.type(screen.getByLabelText('Nombre'), 'Pía Pasajera');
  if (telefono) await usuario.type(screen.getByLabelText('Teléfono (WhatsApp)'), telefono);
  await usuario.type(screen.getByLabelText('Origen'), 'Av. Siempre Viva 123');
  await usuario.type(screen.getByLabelText('Destino'), 'Calle Falsa 456');
  fijarHora('Recogida', '2026-11-02T10:00');
  return usuario;
}

function cuerpos(viajes: ReturnType<typeof montarPanel>['viajes'], ruta: string) {
  return viajes.cuerpos.filter((c) => c.ruta === ruta).map((c) => c.cuerpo);
}

describe('crear reserva', () => {
  it('9 dígitos que empiezan con 9: el teléfono se completa a +569… a la vista y así se envía', async () => {
    const { viajes, router } = await abrirNueva();
    const usuario = await llenarBasico();
    const telefono = screen.getByLabelText('Teléfono (WhatsApp)');
    expect(telefono).toHaveValue('+56912345678'); // completado al salir del campo
    await usuario.click(screen.getByLabelText('WhatsApp'));
    await usuario.click(screen.getByRole('button', { name: 'Guardar reserva' }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/reservas\/\d+$/));
    expect(cuerpos(viajes, 'POST /api/viajes/')).toEqual([
      {
        pasajero: { nombre: 'Pía Pasajera', telefono: '+56912345678' },
        canal: 'WHATSAPP',
        sentido: 'URBANO',
        origen_dir: 'Av. Siempre Viva 123',
        destino_dir: 'Calle Falsa 456',
        recogida_en: '2026-11-02T13:00:00.000Z',
      },
    ]);
    expect(await screen.findByRole('heading', { name: /Reserva #\d+/ })).toBeInTheDocument();
  });

  it('se completa también al enviar sin salir del campo', async () => {
    const { viajes } = await abrirNueva();
    const usuario = await llenarBasico(userEvent.setup(), '');
    const telefono = screen.getByLabelText('Teléfono (WhatsApp)');
    fireEvent.change(telefono, { target: { value: '9 8765 4321' } });
    fireEvent.submit(telefono.closest('form')!);
    await waitFor(() => expect(cuerpos(viajes, 'POST /api/viajes/')).toHaveLength(1));
    expect(telefono).toHaveValue('+56987654321');
    expect(usuario).toBeDefined();
  });

  it('cualquier otro valor se exige en E.164 y no se envía', async () => {
    const { viajes } = await abrirNueva();
    const usuario = await llenarBasico(userEvent.setup(), '812345678');
    expect(screen.getByLabelText('Teléfono (WhatsApp)')).toHaveValue('812345678');
    await usuario.click(screen.getByRole('button', { name: 'Guardar reserva' }));
    expect(await screen.findByText('Teléfono en formato E.164, p. ej. +56912345678.')).toBeInTheDocument();
    expect(viajes.cuerpos).toEqual([]);
  });

  it('el canal solo ofrece Teléfono y WhatsApp', async () => {
    await abrirNueva();
    const canal = screen.getByRole('group', { name: 'Canal' });
    expect(within(canal).getAllByRole('radio').map((r) => r.parentElement?.textContent)).toEqual(['Teléfono', 'WhatsApp']);
  });

  it('el vuelo solo aparece con DESDE_AEROPUERTO, y se envía con su hora en UTC', async () => {
    const { viajes } = await abrirNueva();
    const usuario = await llenarBasico();
    expect(screen.queryByLabelText('Número de vuelo')).not.toBeInTheDocument();
    await usuario.click(screen.getByLabelText('Hacia el aeropuerto'));
    expect(screen.queryByLabelText('Número de vuelo')).not.toBeInTheDocument();
    await usuario.click(screen.getByLabelText('Desde el aeropuerto'));
    await usuario.type(screen.getByLabelText('Número de vuelo'), 'la 123');
    fijarHora('Llegada programada', '2026-11-02T09:15');
    // Al cambiar de sentido se oculta y no se envía.
    await usuario.click(screen.getByLabelText('Urbano'));
    await usuario.click(screen.getByRole('button', { name: 'Guardar reserva' }));
    await waitFor(() => expect(cuerpos(viajes, 'POST /api/viajes/')).toHaveLength(1));
    expect(cuerpos(viajes, 'POST /api/viajes/')[0]).not.toHaveProperty('vuelo');
  });

  it('con DESDE_AEROPUERTO el vuelo va en el cuerpo', async () => {
    const { viajes } = await abrirNueva();
    const usuario = await llenarBasico();
    await usuario.click(screen.getByLabelText('Desde el aeropuerto'));
    await usuario.type(screen.getByLabelText('Número de vuelo'), 'la 123');
    fijarHora('Llegada programada', '2026-11-02T09:15');
    await usuario.click(screen.getByRole('button', { name: 'Guardar reserva' }));
    await waitFor(() => expect(cuerpos(viajes, 'POST /api/viajes/')).toHaveLength(1));
    expect(cuerpos(viajes, 'POST /api/viajes/')[0]).toMatchObject({
      sentido: 'DESDE_AEROPUERTO',
      vuelo: { numero: 'LA 123', hora_programada: '2026-11-02T12:15:00.000Z' },
    });
  });

  it('los 400 del backend se muestran en cada campo, también los anidados', async () => {
    const { viajes } = await abrirNueva();
    viajes.siguiente('POST /api/viajes/', {
      estado: 400,
      cuerpo: {
        pasajero: { telefono: ['Teléfono en formato E.164, p. ej. +56912345678.'] },
        origen_dir: ['El origen está fuera de la zona de operación de la empresa.'],
        recogida_en: ['La hora de recogida debe ser futura.'],
        non_field_errors: ['Revisa los datos.'],
      },
    });
    const usuario = await llenarBasico();
    await usuario.click(screen.getByRole('button', { name: 'Guardar reserva' }));
    expect(await screen.findByText('El origen está fuera de la zona de operación de la empresa.')).toBeInTheDocument();
    expect(screen.getByLabelText('Origen')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('La hora de recogida debe ser futura.')).toBeInTheDocument();
    expect(screen.getByText('Teléfono en formato E.164, p. ej. +56912345678.')).toBeInTheDocument();
    expect(screen.getByText('Revisa los datos.')).toBeInTheDocument();
    // El foco va al primer campo con error.
    await waitFor(() => expect(screen.getByLabelText('Teléfono (WhatsApp)')).toHaveFocus());
  });

  it('una hora inexistente se avisa de inmediato y no se envía', async () => {
    const { viajes } = await abrirNueva();
    const usuario = await llenarBasico();
    fijarHora('Recogida', '2026-09-06T00:30');
    expect(
      screen.getByText(
        'Esa hora no existe en Chile por el cambio al horario de verano (de 00:00 a 00:59 del 06-09-2026). Elige 01:00 o después.',
      ),
    ).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Guardar reserva' }));
    await waitFor(() => expect(screen.getByLabelText('Recogida')).toHaveAttribute('aria-invalid', 'true'));
    expect(viajes.cuerpos).toEqual([]);
  });

  it('sin respuesta del servidor: no sabemos si se creó', async () => {
    const { servidor } = await abrirNueva();
    servidor.fallar('POST /api/viajes/', 'red');
    const usuario = await llenarBasico();
    await usuario.click(screen.getByRole('button', { name: 'Guardar reserva' }));
    expect(await screen.findByText(/No sabemos si la reserva se creó/)).toBeInTheDocument();
  });

  it('un 500 al crear dice que el servidor tuvo un error', async () => {
    const { servidor } = await abrirNueva();
    servidor.fallar('POST /api/viajes/', 500);
    const usuario = await llenarBasico();
    await usuario.click(screen.getByRole('button', { name: 'Guardar reserva' }));
    expect(await screen.findByText(MENSAJES.error_servidor)).toBeInTheDocument();
  });

  it('después de crear, el listado se vuelve a consultar (invalidación) y muestra la nueva', async () => {
    const { servidor, router } = montarPanel('/reservas?desde=');
    await esperarListado();
    expect(screen.getByText('Aún no hay reservas.')).toBeInTheDocument();
    const antes = consultasDelListado(servidor).length;
    await userEvent.click(screen.getAllByRole('link', { name: 'Nueva reserva' })[0]);
    await screen.findByRole('heading', { name: 'Nueva reserva' });
    const usuario = await llenarBasico();
    await usuario.click(screen.getByRole('button', { name: 'Guardar reserva' }));
    await screen.findByRole('heading', { name: /Reserva #\d+/ });
    await router.navigate('/reservas?desde=');
    expect(await screen.findByRole('row', { name: /Pía Pasajera/ })).toBeInTheDocument();
    expect(consultasDelListado(servidor).length).toBe(antes + 1);
  });
});

describe('hora repetida, con el navegador en Asia/Tokyo', () => {
  let restaurar = () => {};
  beforeAll(() => {
    restaurar = cambiarZona('Asia/Tokyo');
  });
  afterAll(() => restaurar());

  it('aviso con el desfase y selector: primera (UTC−3) por defecto, segunda (UTC−4) al elegirla', async () => {
    const { viajes } = await abrirNueva();
    const usuario = await llenarBasico();
    fijarHora('Recogida', '2026-04-04T23:30');
    const aviso = screen.getByRole('status', { name: '' });
    expect(aviso).toHaveTextContent('Esta hora ocurre dos veces por el cambio al horario de invierno. Se usará la primera (UTC−3).');
    expect(screen.getByLabelText('primera (UTC−3)')).toBeChecked();
    await usuario.click(screen.getByLabelText('segunda (UTC−4)'));
    expect(aviso).toHaveTextContent('Se usará la segunda (UTC−4).');
    await usuario.click(screen.getByRole('button', { name: 'Guardar reserva' }));
    await waitFor(() => expect(cuerpos(viajes, 'POST /api/viajes/')).toHaveLength(1));
    expect(cuerpos(viajes, 'POST /api/viajes/')[0]).toMatchObject({ recogida_en: '2026-04-05T03:30:00.000Z' });
  });

  it('sin tocar el selector se envía la primera ocurrencia; una hora normal no depende de Tokio', async () => {
    const { viajes } = await abrirNueva();
    const usuario = await llenarBasico();
    fijarHora('Recogida', '2026-04-04T23:30');
    await usuario.click(screen.getByRole('button', { name: 'Guardar reserva' }));
    await waitFor(() => expect(cuerpos(viajes, 'POST /api/viajes/')).toHaveLength(1));
    expect(cuerpos(viajes, 'POST /api/viajes/')[0]).toMatchObject({ recogida_en: '2026-04-05T02:30:00.000Z' });
  });
});

describe('editar reserva', () => {
  const conVuelo = () =>
    viajeDePrueba({
      id: 5,
      sentido: 'DESDE_AEROPUERTO',
      recogida_en: '2026-11-02T13:00:00Z',
      vuelo: { numero: 'LA123', fecha: '2026-11-02', hora_programada: '2026-11-02T12:15:00Z', hora_estimada: null, estado_vuelo: 'PROGRAMADO' },
    });

  async function abrirEdicion(viaje = conVuelo()) {
    const contexto = montarPanel(`/reservas/${viaje.id}/editar`);
    contexto.viajes.agregar(viaje);
    await screen.findByRole('heading', { name: `Editar reserva #${viaje.id}` });
    return contexto;
  }

  it('pasajero, teléfono y canal en solo lectura; envía solo lo modificado', async () => {
    const { viajes, router } = await abrirEdicion();
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
    expect(screen.getByText('Pía Pasajera')).toBeInTheDocument();
    expect(screen.getByText('+56900000001')).toBeInTheDocument();
    expect(screen.getByLabelText('Recogida')).toHaveValue('2026-11-02T10:00');
    expect(screen.getByLabelText('Número de vuelo')).toHaveValue('LA123');
    const destino = screen.getByLabelText('Destino');
    await userEvent.clear(destino);
    await userEvent.type(destino, 'Hotel Andes');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/reservas/5'));
    // Ni la hora ni el vuelo (y su ETA) se reenvían.
    expect(cuerpos(viajes, 'PATCH /api/viajes/5/')).toEqual([{ destino_dir: 'Hotel Andes' }]);
  });

  it('sin cambios no se envía nada', async () => {
    const { viajes } = await abrirEdicion();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('No hay cambios que guardar.')).toBeInTheDocument();
    expect(viajes.cuerpos).toEqual([]);
  });

  it('cambiar el sentido avisa que se quitará el vuelo y no lo envía (lo quita el backend)', async () => {
    const { viajes } = await abrirEdicion();
    await userEvent.click(screen.getByLabelText('Urbano'));
    expect(screen.getByText('Al guardar con este sentido se quitará el vuelo registrado (LA123).')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(cuerpos(viajes, 'PATCH /api/viajes/5/')).toEqual([{ sentido: 'URBANO' }]));
  });

  it('cambiar la hora la envía en UTC', async () => {
    const { viajes } = await abrirEdicion();
    fijarHora('Recogida', '2026-11-03T08:00');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(cuerpos(viajes, 'PATCH /api/viajes/5/')).toEqual([{ recogida_en: '2026-11-03T11:00:00.000Z' }]));
  });

  it('una reserva que no es editable lo explica y no muestra el formulario', async () => {
    const viaje = viajeDePrueba({ id: 6, estado: 'ASIGNADO' });
    const { viajes } = montarPanel('/reservas/6/editar');
    viajes.agregar(viaje);
    expect(await screen.findByText(/Esta reserva ya no se puede editar: está en estado Asignado/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
  });

  it('409: la reserva cambió de estado; el formulario queda bloqueado con lo escrito y el estado real', async () => {
    const { viajes } = await abrirEdicion();
    const destino = screen.getByLabelText('Destino');
    await userEvent.clear(destino);
    await userEvent.type(destino, 'Hotel Andes');
    viajes.cambiarEstado(5, 'ASIGNADO'); // otro despachador lo asignó
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(
      await screen.findByText(/Solo se puede editar una reserva pendiente de confirmación o solicitada/),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Estado actual: Asignado\./)).toBeInTheDocument());
    expect(screen.getByLabelText('Destino')).toHaveValue('Hotel Andes');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('un 400 en la hora lleva el foco a la recogida', async () => {
    const { viajes } = await abrirEdicion();
    viajes.siguiente('PATCH /api/viajes/5/', { estado: 400, cuerpo: { recogida_en: ['La hora de recogida debe ser futura.'] } });
    fijarHora('Recogida', '2026-11-03T08:00');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('La hora de recogida debe ser futura.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Recogida')).toHaveFocus());
  });

  it('un 400 al editar se muestra en su campo', async () => {
    const { viajes } = await abrirEdicion();
    viajes.siguiente('PATCH /api/viajes/5/', { estado: 400, cuerpo: { destino_dir: ['No se pudo ubicar la dirección.'] } });
    await userEvent.type(screen.getByLabelText('Destino'), ' 2');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('No se pudo ubicar la dirección.')).toBeInTheDocument();
  });

  it('id que no es número: no encontrada, sin petición', async () => {
    const { servidor } = montarPanel('/reservas/abc/editar');
    expect(await screen.findByText('Reserva no encontrada')).toBeInTheDocument();
    expect(servidor.urls.filter((u) => u.includes('/api/viajes/'))).toEqual([]);
  });
});
