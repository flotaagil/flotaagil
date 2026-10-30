/**
 * Backend falso del portal público: GET /api/portal/{slug}/ y POST /api/portal/{slug}/solicitudes/.
 *
 * Imita las respuestas del backend (201 con recogida calculada como llegada + margen si no viene, 404 de
 * empresa inexistente, 429 con `code`) y permite programar la próxima respuesta del POST, fallas de red y
 * respuestas retenidas. Cualquier llamada a /api/auth/ hace fallar la prueba: el portal no tiene sesión.
 */

import type { EmpresaPublica, Solicitud, SolicitudRespuesta } from '../portal/api';

export const AHORA_PORTAL = Date.parse('2026-10-30T15:00:00Z'); // vie 30-10-2026 12:00 en Santiago

export const EMPRESA_PORTAL: EmpresaPublica = {
  razon_social: 'Transportes Andes Demo SpA',
  slug: 'transportes-andes',
  anticipacion_minima_min: 30,
  expiracion_verificacion_min: 15,
  margen_nacional_min: 20,
};

interface Programada {
  estado: number | 'red';
  cuerpo?: unknown;
}

export class ServidorPortalFalso {
  empresas: Record<string, EmpresaPublica> = { [EMPRESA_PORTAL.slug]: EMPRESA_PORTAL };
  llamadas: string[] = [];
  cuerpos: Solicitud[] = [];
  /** Llamadas prohibidas (p. ej. a /api/auth/): la prueba las revisa. */
  prohibidas: string[] = [];
  fallaEmpresa: number | 'red' | null = null;
  private programadas: Programada[] = [];
  private retenidas: (() => void)[] = [];
  retenerEnvios = false;

  constructor(readonly ahora = AHORA_PORTAL) {}

  /** La próxima solicitud responde esto (o falla por red). */
  siguiente(respuesta: Programada) {
    this.programadas.push(respuesta);
  }

  /** Entrega el primer envío retenido. */
  entregar() {
    this.retenidas.shift()?.();
  }

  fetch = async (entrada: Request | string, init?: RequestInit): Promise<Response> => {
    const peticion = entrada instanceof Request ? entrada : new Request(entrada, init);
    const url = new URL(peticion.url);
    const ruta = `${peticion.method} ${url.pathname}`;
    this.llamadas.push(ruta);
    if (!url.pathname.startsWith('/api/portal/')) {
      this.prohibidas.push(ruta);
      throw new Error(`El portal no debe llamar a ${ruta}`);
    }
    const [, , , slug, recurso] = url.pathname.split('/');
    const empresa = this.empresas[slug];
    if (peticion.method === 'GET' && !recurso) {
      if (this.fallaEmpresa === 'red') throw new TypeError('Failed to fetch');
      if (this.fallaEmpresa) return json(this.fallaEmpresa, { detail: 'Error.' });
      return empresa ? json(200, empresa) : json(404, { detail: 'No encontrado.' });
    }
    const cuerpo = (await peticion.json()) as Solicitud;
    this.cuerpos.push(cuerpo);
    const responder = (): Response => {
      const programada = this.programadas.shift();
      if (programada?.estado === 'red') throw new TypeError('Failed to fetch');
      if (programada) return json(programada.estado, programada.cuerpo ?? {});
      if (!empresa) return json(404, { detail: 'No encontrado.' });
      const recogida = cuerpo.recogida_en
        ? Date.parse(cuerpo.recogida_en)
        : Date.parse(cuerpo.vuelo!.hora_llegada) + empresa.margen_nacional_min * 60_000;
      const respuesta: SolicitudRespuesta = {
        estado: 'PENDIENTE_CONFIRMACION',
        recogida_en: new Date(recogida).toISOString(),
        expira_en: new Date(this.ahora + empresa.expiracion_verificacion_min * 60_000).toISOString(),
        mensaje: 'Recibimos tu solicitud. Te enviaremos un WhatsApp para confirmarla.',
      };
      return json(201, respuesta);
    };
    if (!this.retenerEnvios) return responder();
    return new Promise((resolver, rechazar) => {
      this.retenidas.push(() => {
        try {
          resolver(responder());
        } catch (error) {
          rechazar(error);
        }
      });
    });
  };
}

function json(estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });
}
