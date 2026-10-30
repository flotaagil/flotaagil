/**
 * /api/viajes/ falso, montado sobre el servidor de auth falso (mismo `fetch`, mismo access). Imita lo que la
 * interfaz usa del backend: listado paginado de a 25 (filtra por estado; el resto de la query solo se
 * registra en `servidor.urls` para revisarla), detalle con historial, crear (201), editar (409 fuera de
 * PENDIENTE_CONFIRMACION y SOLICITADO) y cancelar (409 fuera de los cancelables). `siguiente` programa la
 * próxima respuesta de una ruta (p. ej. un 400 con el formato de DRF). Los datos se tipan con el esquema
 * generado: si el contrato cambia, no compilan.
 */

import type { components } from '../api/esquema';
import type { EstadoViaje, ViajeCrear, ViajeDetalle, ViajeEditar } from '../reservas/api';
import type { Respuesta, ServidorAuthFalso } from './servidorAuthFalso';

const EDITABLES: EstadoViaje[] = ['PENDIENTE_CONFIRMACION', 'SOLICITADO'];
const CANCELABLES: EstadoViaje[] = ['PENDIENTE_CONFIRMACION', 'SOLICITADO', 'ACEPTADO', 'EN_CAMINO', 'EN_ZONA'];

type Historial = components['schemas']['Historial'];

let siguienteId = 100;

/** Reserva completa con valores sintéticos; `cambios` reemplaza lo que haga falta. */
export function viajeDePrueba(cambios: Partial<ViajeDetalle> = {}): ViajeDetalle {
  const estado = cambios.estado ?? 'SOLICITADO';
  const id = cambios.id ?? ++siguienteId;
  return {
    id,
    estado,
    canal: 'TELEFONO',
    sentido: 'URBANO',
    pasajero: { id: 1, nombre: 'Pía Pasajera', telefono: '+56900000001' },
    origen: { direccion: 'Av. Siempre Viva 123', lat: -33.44, lon: -70.65 },
    destino: { direccion: 'Calle Falsa 456', lat: -33.42, lon: -70.6 },
    recogida_en: '2026-11-02T13:00:00Z',
    tarifa: null,
    conductor: null,
    vehiculo: null,
    convenio: null,
    vuelo: null,
    motivo_cancelacion: null,
    origen_cancelacion: null,
    creado_en: '2026-10-30T12:00:00Z',
    editable: EDITABLES.includes(estado),
    cancelable: CANCELABLES.includes(estado),
    historial: [
      { estado_anterior: null, estado_nuevo: 'SOLICITADO', actor: 'DESPACHADOR', usuario: 'Diego Despacho', creado_en: '2026-10-30T12:00:00Z' },
    ],
    ...cambios,
  };
}

/** El listado no trae el historial. */
function resumen(viaje: ViajeDetalle): Omit<ViajeDetalle, 'historial'> {
  return Object.fromEntries(Object.entries(viaje).filter(([clave]) => clave !== 'historial')) as Omit<ViajeDetalle, 'historial'>;
}

export class ServidorViajesFalso {
  viajes: ViajeDetalle[] = [];
  /** Cuerpos recibidos, por ruta («POST /api/viajes/», «PATCH /api/viajes/7/»…). */
  cuerpos: { ruta: string; cuerpo: unknown }[] = [];
  private programadas = new Map<string, Respuesta[]>();

  constructor(readonly auth: ServidorAuthFalso) {
    auth.api = (peticion, url) => this.atender(peticion, url);
  }

  agregar(...viajes: ViajeDetalle[]): ViajeDetalle[] {
    this.viajes.push(...viajes);
    return viajes;
  }

  /** La próxima petición a esa ruta («PATCH /api/viajes/7/») responde esto, sin tocar los datos. */
  siguiente(ruta: string, respuesta: Respuesta) {
    this.programadas.set(ruta, [...(this.programadas.get(ruta) ?? []), respuesta]);
  }

  /** Cambia el estado de una reserva «por fuera» (otro despachador, el conductor…). */
  cambiarEstado(id: number, estado: EstadoViaje) {
    const viaje = this.buscar(id)!;
    Object.assign(viaje, { estado, editable: EDITABLES.includes(estado), cancelable: CANCELABLES.includes(estado) });
  }

  buscar(id: number): ViajeDetalle | undefined {
    return this.viajes.find((viaje) => viaje.id === id);
  }

  private async atender(peticion: Request, url: URL): Promise<Respuesta> {
    const ruta = `${peticion.method} ${url.pathname}`;
    const cuerpo = peticion.method === 'GET' ? undefined : await peticion.json();
    if (cuerpo !== undefined) this.cuerpos.push({ ruta, cuerpo });
    const programada = this.programadas.get(ruta)?.shift();
    if (programada) return programada;

    if (ruta === 'GET /api/viajes/') return this.listar(url);
    if (ruta === 'POST /api/viajes/') return this.crear(cuerpo as ViajeCrear);
    const detalle = /^\/api\/viajes\/(\d+)\/(cancelar\/)?$/.exec(url.pathname);
    const viaje = detalle && this.buscar(Number(detalle[1]));
    if (!viaje) return { estado: 404, cuerpo: { detail: 'No encontrado.' } };
    if (detalle[2] && peticion.method === 'POST') return this.cancelar(viaje, (cuerpo as { motivo: string }).motivo);
    if (peticion.method === 'PATCH') return this.editar(viaje, cuerpo as ViajeEditar);
    return { estado: 200, cuerpo: viaje };
  }

  private listar(url: URL): Respuesta {
    const estados = url.searchParams.getAll('estado');
    const filtrados = estados.length ? this.viajes.filter((v) => estados.includes(v.estado!)) : this.viajes;
    const pagina = Number(url.searchParams.get('page') ?? 1);
    const paginas = Math.max(1, Math.ceil(filtrados.length / 25));
    if (pagina > paginas) return { estado: 404, cuerpo: { detail: 'Página inválida.' } };
    const conPagina = (n: number) => {
      const otra = new URL(url);
      otra.searchParams.set('page', String(n));
      return otra.toString();
    };
    return {
      estado: 200,
      cuerpo: {
        count: filtrados.length,
        next: pagina < paginas ? conPagina(pagina + 1) : null,
        previous: pagina > 1 ? conPagina(pagina - 1) : null,
        results: filtrados.slice((pagina - 1) * 25, pagina * 25).map(resumen),
      },
    };
  }

  private crear(datos: ViajeCrear): Respuesta {
    const viaje = viajeDePrueba({
      canal: datos.canal ?? 'TELEFONO',
      sentido: datos.sentido ?? 'URBANO',
      pasajero: { id: 9, ...datos.pasajero },
      origen: { direccion: datos.origen_dir, lat: -33.4, lon: -70.6 },
      destino: { direccion: datos.destino_dir, lat: -33.4, lon: -70.6 },
      recogida_en: datos.recogida_en,
      vuelo: datos.vuelo
        ? { numero: datos.vuelo.numero, hora_programada: datos.vuelo.hora_programada, fecha: datos.vuelo.hora_programada.slice(0, 10), hora_estimada: null, estado_vuelo: 'PROGRAMADO' }
        : null,
    });
    this.viajes.push(viaje);
    return { estado: 201, cuerpo: viaje };
  }

  private editar(viaje: ViajeDetalle, cambios: ViajeEditar): Respuesta {
    if (!viaje.editable) {
      return { estado: 409, cuerpo: { detail: 'Solo se puede editar una reserva pendiente de confirmación o solicitada (antes del despacho).' } };
    }
    // Los campos de solo lectura del esquema (origen, destino, vuelo) se reemplazan en una copia.
    const editado: ViajeDetalle = {
      ...viaje,
      sentido: cambios.sentido ?? viaje.sentido,
      origen: cambios.origen_dir ? { ...viaje.origen, direccion: cambios.origen_dir } : viaje.origen,
      destino: cambios.destino_dir ? { ...viaje.destino, direccion: cambios.destino_dir } : viaje.destino,
      recogida_en: cambios.recogida_en ?? viaje.recogida_en,
    };
    const sentido = editado.sentido;
    const vuelo =
      cambios.vuelo !== undefined || sentido !== 'DESDE_AEROPUERTO'
        ? cambios.vuelo
          ? { numero: cambios.vuelo.numero, hora_programada: cambios.vuelo.hora_programada, fecha: cambios.vuelo.hora_programada.slice(0, 10), hora_estimada: null, estado_vuelo: 'PROGRAMADO' as const }
          : null
        : viaje.vuelo;
    const final = { ...editado, vuelo };
    this.viajes[this.viajes.indexOf(viaje)] = final;
    return { estado: 200, cuerpo: final };
  }

  private cancelar(viaje: ViajeDetalle, motivo: string): Respuesta {
    if (!viaje.cancelable) {
      return { estado: 409, cuerpo: { detail: `Una reserva en estado ${viaje.estado} no se puede cancelar desde aquí.` } };
    }
    const anterior = viaje.estado!;
    const cambio: Historial = { estado_anterior: anterior, estado_nuevo: 'CANCELADO', actor: 'DESPACHADOR', usuario: 'Diego Despacho', creado_en: '2026-10-30T13:00:00Z' };
    Object.assign(viaje, {
      estado: 'CANCELADO',
      editable: false,
      cancelable: false,
      motivo_cancelacion: motivo.trim(),
      origen_cancelacion: 'DESPACHADOR',
      historial: [...viaje.historial, cambio],
    });
    return { estado: 200, cuerpo: viaje };
  }
}
