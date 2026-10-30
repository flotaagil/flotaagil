/** Arranque sin servidor, menú, Inicio y carga diferida de las pantallas. */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { hoy } from '../hora/hora';
import { esperarListado, montarPanel } from '../pruebas/montar';
import { ServidorAuthFalso } from '../pruebas/servidorAuthFalso';

describe('arranque sin servidor', () => {
  it.each([
    ['red', 'No se pudo conectar con el servidor'],
    [502, 'No se pudo conectar con el servidor'],
    [503, 'No se pudo conectar con el servidor'],
    [504, 'No se pudo conectar con el servidor'],
    [500, 'El servidor tuvo un error'],
  ] as const)('refresh con %s → «%s» con Reintentar, en vez del login', async (falla, titulo) => {
    const servidor = new ServidorAuthFalso();
    servidor.fallar('POST /api/auth/refresh/', falla);
    const { router } = montarPanel('/reservas?estado=SOLICITADO', { servidor });
    expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument();
    expect(screen.queryByLabelText('Correo')).not.toBeInTheDocument();
    // La URL se conserva para cuando vuelva el servidor.
    expect(router.state.location).toMatchObject({ pathname: '/reservas', search: '?estado=SOLICITADO' });

    servidor.reparar();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await esperarListado();
    expect(router.state.location.search).toBe('?estado=SOLICITADO');
  });

  it('Reintentar con el servidor todavía caído sigue mostrando el aviso', async () => {
    const servidor = new ServidorAuthFalso();
    servidor.fallar('POST /api/auth/refresh/', 'red');
    montarPanel('/', { servidor });
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(servidor.cuenta('POST /api/auth/refresh/')).toBe(2));
    expect(await screen.findByRole('heading', { name: 'No se pudo conectar con el servidor' })).toBeInTheDocument();
  });

  it('también en /login', async () => {
    const servidor = new ServidorAuthFalso();
    servidor.fallar('POST /api/auth/refresh/', 503);
    montarPanel('/login', { servidor });
    expect(await screen.findByRole('heading', { name: 'No se pudo conectar con el servidor' })).toBeInTheDocument();
  });

  it('al volver la conexión entra solo', async () => {
    const servidor = new ServidorAuthFalso();
    servidor.fallar('POST /api/auth/refresh/', 'red');
    const { volverLaConexion } = montarPanel('/', { servidor });
    await screen.findByRole('button', { name: 'Reintentar' });
    servidor.reparar();
    volverLaConexion();
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
  });
});

describe('menú e Inicio', () => {
  it.each(['admin@andes.example', 'despacho@andes.example'])('%s ve «Reservas» en el menú', async (email) => {
    montarPanel('/', { email });
    const menu = await screen.findByRole('navigation', { name: 'Menú principal' });
    expect(within(menu).getAllByRole('link').map((a) => a.textContent)).toEqual(['Inicio', 'Reservas']);
  });

  it('«Reservas» queda marcada también en el detalle', async () => {
    montarPanel('/reservas/999');
    const menu = await screen.findByRole('navigation', { name: 'Menú principal' });
    await screen.findByText('Reserva no encontrada');
    expect(within(menu).getByRole('link', { name: 'Reservas' })).toHaveAttribute('aria-current', 'page');
    expect(within(menu).getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
  });

  it('Inicio: enlaces al listado filtrado y «Nueva reserva», sin consultar reservas', async () => {
    const { servidor } = montarPanel('/');
    await screen.findByRole('heading', { name: 'Inicio' });
    const atajos = within(screen.getByRole('list', { name: 'Atajos a las reservas' })).getAllByRole('link');
    expect(atajos.map((a) => a.getAttribute('href'))).toEqual([
      `/reservas?fecha=${hoy()}`,
      '/reservas?estado=PENDIENTE_CONFIRMACION',
      '/reservas?estado=SOLICITADO',
      '/reservas',
    ]);
    expect(screen.getByRole('link', { name: 'Nueva reserva' })).toHaveAttribute('href', '/reservas/nueva');
    expect(servidor.urls.filter((u) => u.includes('/api/viajes/'))).toEqual([]);
  });

  it('un atajo lleva al listado con su filtro', async () => {
    const { servidor } = montarPanel('/');
    await userEvent.click(await screen.findByRole('link', { name: /Por confirmar/ }));
    await esperarListado();
    expect(servidor.urls.at(-1)).toMatch(/^GET \/api\/viajes\/\?estado=PENDIENTE_CONFIRMACION&desde=/);
  });
});
