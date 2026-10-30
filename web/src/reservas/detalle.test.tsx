/** Detalle con historial y cancelación con motivo (CP-06). */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MENSAJES } from '../api/errores';
import { esperarListado, montarPanel } from '../pruebas/montar';
import { viajeDePrueba } from '../pruebas/servidorViajesFalso';

async function abrirDetalle(viaje = viajeDePrueba({ id: 8 })) {
  const contexto = montarPanel(`/reservas/${viaje.id}`);
  contexto.viajes.agregar(viaje);
  await screen.findByRole('heading', { name: new RegExp(`Reserva #${viaje.id}`) });
  return contexto;
}

describe('detalle', () => {
  it('muestra los datos en hora de Santiago y el historial en orden', async () => {
    await abrirDetalle(
      viajeDePrueba({
        id: 8,
        estado: 'ASIGNADO',
        sentido: 'DESDE_AEROPUERTO',
        recogida_en: '2026-07-15T14:00:00Z',
        conductor: { id: 3, nombre: 'Carla Conductora' },
        vehiculo: { id: 4, patente: 'ABCD12' },
        vuelo: { numero: 'LA123', fecha: '2026-07-15', hora_programada: '2026-07-15T13:30:00Z', hora_estimada: '2026-07-15T13:50:00Z', estado_vuelo: 'DEMORADO' },
        historial: [
          { estado_anterior: 'SOLICITADO', estado_nuevo: 'ASIGNADO', actor: 'SISTEMA', usuario: '', creado_en: '2026-07-15T12:01:00Z' },
          { estado_anterior: null, estado_nuevo: 'SOLICITADO', actor: 'DESPACHADOR', usuario: 'Diego Despacho', creado_en: '2026-07-15T12:00:00Z' },
        ],
      }),
    );
    expect(screen.getByRole('heading', { name: 'Reserva #8 Asignado' })).toBeInTheDocument();
    expect(screen.getByText('mié 15-07-2026 10:00')).toBeInTheDocument();
    expect(screen.getByText(/LA123 · llegada programada mié 15-07-2026 09:30 · estimada mié 15-07-2026 09:50 · Demorado/)).toBeInTheDocument();
    expect(screen.getByText('Carla Conductora · ABCD12')).toBeInTheDocument();
    const pasos = within(screen.getByRole('list', { name: 'Historial de estados' })).getAllByRole('listitem');
    expect(pasos.map((p) => p.textContent)).toEqual([
      'Solicitadomié 15-07-2026 08:00 · Despachador · Diego Despacho',
      'Solicitado → Asignadomié 15-07-2026 08:01 · Sistema',
    ]);
    // ASIGNADO: ni editar ni cancelar, con la explicación.
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar reserva…' })).not.toBeInTheDocument();
    expect(screen.getByText('No se puede editar ni cancelar mientras se espera la respuesta del conductor.')).toBeInTheDocument();
  });

  it.each([
    ['SOLICITADO', true, true, null],
    ['EN_CAMINO', false, true, 'Ya fue despachada: se puede cancelar, pero no editar.'],
    ['FINALIZADO', false, false, 'La reserva está cerrada.'],
    ['PASAJERO_A_BORDO', false, false, 'Ya no admite cambios desde el panel.'],
  ] as const)('%s: editar %s, cancelar %s', async (estado, editar, cancelar, explicacion) => {
    await abrirDetalle(viajeDePrueba({ id: 9, estado }));
    expect(Boolean(screen.queryByRole('link', { name: 'Editar' }))).toBe(editar);
    expect(Boolean(screen.queryByRole('button', { name: 'Cancelar reserva…' }))).toBe(cancelar);
    if (explicacion) expect(screen.getByText(explicacion)).toBeInTheDocument();
  });

  it('una cancelada muestra el motivo y quién la canceló', async () => {
    await abrirDetalle(viajeDePrueba({ id: 10, estado: 'CANCELADO', motivo_cancelacion: 'El pasajero no viaja.', origen_cancelacion: 'PASAJERO' }));
    expect(screen.getByText('El pasajero no viaja. (Pasajero)')).toBeInTheDocument();
  });

  it('404 (no existe o es de otra empresa): «Reserva no encontrada»', async () => {
    montarPanel('/reservas/999');
    expect(await screen.findByRole('heading', { name: 'Reserva no encontrada' })).toBeInTheDocument();
  });

  it('un error de red ofrece Reintentar', async () => {
    const { servidor, viajes } = montarPanel('/reservas/11');
    viajes.agregar(viajeDePrueba({ id: 11 }));
    servidor.fallar('GET /api/viajes/11/', 'red');
    expect(await screen.findByText(MENSAJES.sin_conexion)).toBeInTheDocument();
    servidor.reparar();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: /Reserva #11/ })).toBeInTheDocument();
  });
});

describe('cancelar con motivo (CP-06)', () => {
  it('el motivo es obligatorio: sin motivo no se envía', async () => {
    const { viajes } = await abrirDetalle();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar reserva…' }));
    const dialogo = screen.getByRole('dialog', { name: 'Cancelar la reserva #8' });
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), '   ');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar reserva' }));
    expect(await within(dialogo).findByText('Indica el motivo de la cancelación.')).toBeInTheDocument();
    expect(viajes.cuerpos).toEqual([]);
  });

  it('confirmar cancela: estado, motivo e historial actualizados', async () => {
    const { viajes } = await abrirDetalle();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar reserva…' }));
    const dialogo = screen.getByRole('dialog');
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), ' El pasajero no viaja. ');
    expect(within(dialogo).getByText('23/200')).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar reserva' }));
    expect(await screen.findByText('Reserva cancelada.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(viajes.cuerpos).toEqual([{ ruta: 'POST /api/viajes/8/cancelar/', cuerpo: { motivo: 'El pasajero no viaja.' } }]);
    expect(screen.getByRole('heading', { name: 'Reserva #8 Cancelado' })).toBeInTheDocument();
    expect(screen.getByText('El pasajero no viaja. (Despachador)')).toBeInTheDocument();
    expect(screen.getByText(/Solicitado → Cancelado/)).toBeInTheDocument();
  });

  it('«Volver» cierra sin cancelar; con conductor asignado lo advierte', async () => {
    const { viajes } = await abrirDetalle(viajeDePrueba({ id: 12, estado: 'EN_CAMINO', conductor: { id: 3, nombre: 'Carla Conductora' } }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar reserva…' }));
    expect(screen.getByText('El conductor Carla Conductora ya está asignado a esta reserva.')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Volver' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(viajes.cuerpos).toEqual([]);
  });

  it('409: la reserva ya no se puede cancelar; se muestra el motivo y el estado real', async () => {
    const { viajes } = await abrirDetalle();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar reserva…' }));
    viajes.cambiarEstado(8, 'FINALIZADO');
    const dialogo = screen.getByRole('dialog');
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'Duplicada');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar reserva' }));
    expect(await within(dialogo).findByText('Una reserva en estado FINALIZADO no se puede cancelar desde aquí.')).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Volver' }));
    // El detalle se recargó (invalidación) y ya no ofrece cancelar.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Reserva #8 Finalizado' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Cancelar reserva…' })).not.toBeInTheDocument();
  });

  it('después de cancelar, el listado se vuelve a consultar y muestra el estado nuevo', async () => {
    const { viajes, router } = montarPanel('/reservas?desde=');
    viajes.agregar(viajeDePrueba({ id: 13, pasajero: { id: 1, nombre: 'Rita Ruiz', telefono: '+56900000002' } }));
    await esperarListado();
    expect(screen.getByRole('row', { name: /Rita Ruiz/ })).toHaveTextContent('Solicitado');
    await userEvent.click(within(screen.getByRole('row', { name: /Rita Ruiz/ })).getByRole('link'));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar reserva…' }));
    await userEvent.type(within(screen.getByRole('dialog')).getByLabelText('Motivo'), 'Duplicada');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar reserva' }));
    await screen.findByText('Reserva cancelada.');
    await router.navigate(-1);
    await waitFor(() => expect(screen.getByRole('row', { name: /Rita Ruiz/ })).toHaveTextContent('Cancelado'));
  });
});
