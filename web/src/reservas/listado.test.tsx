import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MENSAJES } from '../api/errores';
import { aIso, hoy, inicioDelDia } from '../hora/hora';
import { consultasDelListado, esperarListado, montarPanel } from '../pruebas/montar';
import type { ServidorAuthFalso } from '../pruebas/servidorAuthFalso';
import { viajeDePrueba } from '../pruebas/servidorViajesFalso';

/** Query de la última petición al listado, como lista de pares (estado puede repetirse). */
function ultimaConsulta(servidor: ServidorAuthFalso): [string, string][] {
  const url = consultasDelListado(servidor).at(-1)!;
  return [...new URLSearchParams(url.split('?')[1] ?? '').entries()];
}

const HOY_00 = () => aIso(inicioDelDia(hoy()));

describe('listado de reservas', () => {
  it('vista por defecto: «desde hoy 00:00» visible y aplicado; filas con la hora en Santiago', async () => {
    const { servidor, viajes } = montarPanel('/reservas');
    viajes.agregar(viajeDePrueba({ id: 7, recogida_en: '2026-04-05T03:30:00Z', pasajero: { id: 1, nombre: 'Rita Ruiz', telefono: '+56900000002' } }));
    await esperarListado();
    expect(screen.getByRole('list', { name: 'Filtros activos' })).toHaveTextContent('Desde hoy 00:00');
    expect(ultimaConsulta(servidor)).toEqual([['desde', HOY_00()]]);
    const fila = screen.getByRole('row', { name: /Rita Ruiz/ });
    // La hora repetida de abril se muestra con su desfase.
    expect(within(fila).getByRole('link', { name: 'sáb 04-04-2026 23:30 (UTC−4)' })).toHaveAttribute('href', '/reservas/7');
    expect(fila).toHaveTextContent('Solicitado');
    expect(screen.getByText(/1 reserva · página 1 de 1/)).toBeInTheDocument();
  });

  it('quitar «desde hoy» deja `desde=` en la URL y no se aplica', async () => {
    const { servidor, router } = montarPanel('/reservas');
    await esperarListado();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtro Desde hoy 00:00' }));
    await waitFor(() => expect(router.state.location.search).toBe('?desde='));
    await waitFor(() => expect(ultimaConsulta(servidor)).toEqual([]));
  });

  it('los filtros de la URL van a la API y sobreviven a F5', async () => {
    const url =
      '/reservas?estado=PENDIENTE_CONFIRMACION&estado=SOLICITADO&desde=2026-07-15T10%3A00&sentido=DESDE_AEROPUERTO&canal=WHATSAPP&q=r%C3%ADa&ordenar=-creado_en';
    const { servidor, recargar } = montarPanel(url);
    await esperarListado();
    const esperada = [
      ['estado', 'PENDIENTE_CONFIRMACION'],
      ['estado', 'SOLICITADO'],
      ['desde', '2026-07-15T14:00:00.000Z'],
      ['sentido', 'DESDE_AEROPUERTO'],
      ['canal', 'WHATSAPP'],
      ['q', 'ría'],
      ['ordenar', '-creado_en'],
    ];
    expect(ultimaConsulta(servidor)).toEqual(esperada);
    expect(screen.getByRole('combobox', { name: 'Sentido' })).toHaveValue('DESDE_AEROPUERTO');
    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('ría');

    const { router } = recargar();
    await esperarListado();
    expect(router.state.location.search).toBe(url.slice('/reservas'.length));
    expect(ultimaConsulta(servidor)).toEqual(esperada);
    expect(screen.getByRole('list', { name: 'Filtros activos' })).toHaveTextContent('Desde 15-07-2026 10:00');
  });

  it('cambiar un filtro escribe la URL y vuelve a la página 1', async () => {
    const { servidor, router } = montarPanel('/reservas?desde=&page=2');
    await esperarListado();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sentido' }), 'URBANO');
    await waitFor(() => expect(router.state.location.search).toBe('?desde=&sentido=URBANO'));
    await userEvent.click(screen.getByText('Todos', { selector: 'summary' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Cancelado' }));
    await waitFor(() => expect(router.state.location.search).toBe('?estado=CANCELADO&desde=&sentido=URBANO'));
    await waitFor(() => expect(ultimaConsulta(servidor)).toEqual([['estado', 'CANCELADO'], ['sentido', 'URBANO']]));
  });

  it('la búsqueda se escribe en la URL tras dejar de teclear, reemplazando la entrada del historial', async () => {
    const { router } = montarPanel('/reservas?desde=');
    await esperarListado();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'LA123');
    await waitFor(() => expect(router.state.location.search).toBe('?desde=&q=LA123'));
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('una hora inexistente en `desde` se marca y ese filtro no se aplica', async () => {
    const { servidor } = montarPanel('/reservas?desde=2026-09-06T00%3A30');
    await esperarListado();
    expect(screen.getByText(/Esa hora no existe en Chile .* El filtro no se aplicó\./)).toBeInTheDocument();
    expect(ultimaConsulta(servidor)).toEqual([]);
  });

  it('paginación de 25', async () => {
    const { viajes, router, servidor } = montarPanel('/reservas?desde=');
    viajes.agregar(...Array.from({ length: 30 }, () => viajeDePrueba()));
    await esperarListado();
    expect(screen.getByText(/30 reservas · página 1 de 2/)).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(26); // encabezado + 25
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(router.state.location.search).toBe('?desde=&page=2'));
    await waitFor(() => expect(screen.getByText(/página 2 de 2/)).toBeInTheDocument());
    expect(screen.getAllByRole('row')).toHaveLength(6);
    expect(ultimaConsulta(servidor)).toEqual([['page', '2']]);
  });

  it('una página que no existe ofrece volver a la primera', async () => {
    const { router } = montarPanel('/reservas?desde=&page=9');
    expect(await screen.findByText('Esa página no existe.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ir a la primera página' }));
    await waitFor(() => expect(router.state.location.search).toBe('?desde='));
  });

  it('vacío sin filtros: «Aún no hay reservas» con «Nueva reserva»', async () => {
    montarPanel('/reservas?desde=');
    expect(await screen.findByText('Aún no hay reservas.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Nueva reserva' })).toHaveLength(2);
  });

  it('vacío con filtros: «Ninguna reserva coincide» y «Quitar filtros»', async () => {
    const { router } = montarPanel('/reservas?estado=CANCELADO&ordenar=creado_en');
    expect(await screen.findByText('Ninguna reserva coincide con los filtros.')).toBeInTheDocument();
    const quitar = screen.getAllByRole('button', { name: 'Quitar filtros' });
    await userEvent.click(quitar[quitar.length - 1]);
    // Se conserva el orden elegido.
    await waitFor(() => expect(router.state.location.search).toBe('?desde=&ordenar=creado_en'));
  });

  it('cargando: esqueleto mientras llega la respuesta', async () => {
    const { servidor } = montarPanel('/reservas');
    servidor.retener('GET /api/viajes/');
    expect(await screen.findByLabelText('Cargando reservas')).toBeInTheDocument();
    await waitFor(() => expect(servidor.pendientes).toHaveLength(1));
    await act(async () => servidor.entregar());
    await esperarListado();
  });

  it('error: mensaje y Reintentar', async () => {
    const { servidor, viajes } = montarPanel('/reservas?desde=');
    viajes.agregar(viajeDePrueba({ pasajero: { id: 1, nombre: 'Rita Ruiz', telefono: '+56900000002' } }));
    servidor.fallar('GET /api/viajes/', 503);
    expect(await screen.findByText(MENSAJES.sin_conexion)).toBeInTheDocument();
    servidor.reparar();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('row', { name: /Rita Ruiz/ })).toBeInTheDocument();
  });

  it('un 500 dice que el servidor tuvo un error', async () => {
    const { servidor } = montarPanel('/reservas?desde=');
    servidor.fallar('GET /api/viajes/', 500);
    expect(await screen.findByText(MENSAJES.error_servidor)).toBeInTheDocument();
  });
});
