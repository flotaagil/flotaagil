/**
 * Servidor de autenticación falso que imita al backend:
 *
 * - login con `{detail, code}` en los errores; solo acepta JSON (415 si no);
 * - refresh con rotación y lista negra; el rechazo responde 401 SIN Set-Cookie;
 * - logout idempotente: 204 con borrado de la cookie aunque falte, esté vencida o ya invalidada;
 * - un endpoint protegido (/api/viajes/) que acepta solo access vigentes.
 *
 * La cookie es una sola para todas las «pestañas» (`frasco`), como en el navegador. El servidor procesa cada
 * petición en el orden en que llega (lee la cookie al enviarse), pero la entrega de la respuesta puede quedar
 * retenida (`retener`) para que la prueba decida en qué orden llegan: al entregarse se aplica el Set-Cookie y
 * se resuelve la promesa. Así el orden es determinista y no depende del tiempo.
 */

import type { Usuario } from '../api/auth';

interface UsuarioFalso extends Usuario {
  password: string;
  bloqueado?: boolean;
}

const EMPRESA = { id: 1, razon_social: 'Transportes Andes Demo SpA', slug: 'transportes-andes' };

export const USUARIOS: UsuarioFalso[] = [
  { id: 1, nombre: 'Ana Admin', email: 'admin@andes.example', rol: 'ADMINISTRADOR', empresa: EMPRESA, password: 'clave' },
  { id: 2, nombre: 'Diego Despacho', email: 'despacho@andes.example', rol: 'DESPACHADOR', empresa: EMPRESA, password: 'clave' },
  { id: 3, nombre: 'Carla Conductora', email: 'conductor@andes.example', rol: 'CONDUCTOR', empresa: EMPRESA, password: 'clave' },
  { id: 4, nombre: 'Berta Bloqueada', email: 'bloqueada@andes.example', rol: 'DESPACHADOR', empresa: EMPRESA, password: 'clave', bloqueado: true },
];

interface Pendiente {
  ruta: string;
  entregar(): void;
}

interface Respuesta {
  estado: number;
  cuerpo?: unknown;
  /** undefined = sin Set-Cookie; null = borra la cookie; string = nuevo refresh. */
  cookie?: string | null;
}

export class ServidorAuthFalso {
  frasco: { refresh: string | null } = { refresh: null };
  llamadas: string[] = [];
  /** false: todas las peticiones fallan por red (TypeError). */
  enLinea = true;
  /** Ejecuta el logout pero la respuesta se pierde (el navegador no recibe el 204 ni el Set-Cookie). */
  perderRespuestaLogout = false;
  limitarLogin = false;
  rechazarOrigen = false;
  pendientes: Pendiente[] = [];

  private retenidas = new Set<string>();
  private refreshVigentes = new Map<string, UsuarioFalso>();
  private listaNegra = new Set<string>();
  private sesionesExpiradas = new Set<string>();
  private accessVigentes = new Map<string, UsuarioFalso>();
  private contador = 0;

  /** Las respuestas de esta ruta quedan retenidas hasta `entregar`. */
  retener(ruta: string) {
    this.retenidas.add(ruta);
  }

  soltar(ruta: string) {
    this.retenidas.delete(ruta);
  }

  /** Entrega la respuesta retenida número `indice` (en orden de llegada al servidor). */
  entregar(indice = 0) {
    const [pendiente] = this.pendientes.splice(indice, 1);
    if (!pendiente) throw new Error(`No hay respuesta retenida en la posición ${indice}.`);
    pendiente.entregar();
  }

  /** Todos los access emitidos dejan de servir (como al pasar JWT_ACCESS_MIN). */
  vencerAccess() {
    this.accessVigentes.clear();
  }

  /** El refresh vigente pasa a rechazarse con sesion_expirada (tope de 12 h). */
  expirarSesion() {
    if (this.frasco.refresh) this.sesionesExpiradas.add(this.frasco.refresh);
  }

  /** Inicia una sesión directamente (como si el navegador ya tuviera la cookie). */
  sembrarSesion(email = 'despacho@andes.example'): string {
    const usuario = USUARIOS.find((u) => u.email === email)!;
    const refresh = this.emitirRefresh(usuario);
    this.frasco.refresh = refresh;
    return refresh;
  }

  cuenta(ruta: string): number {
    return this.llamadas.filter((llamada) => llamada === ruta).length;
  }

  fetch = async (entrada: Request | string, init?: RequestInit): Promise<Response> => {
    const peticion = entrada instanceof Request ? entrada : new Request(entrada, init);
    const ruta = `${peticion.method} ${new URL(peticion.url).pathname}`;
    this.llamadas.push(ruta);
    if (!this.enLinea) throw new TypeError('Failed to fetch');
    // La cookie se lee al enviar, igual que en el navegador.
    const cookie = this.frasco.refresh;
    const respuesta = await this.atender(ruta, peticion, cookie);
    if (ruta === 'POST /api/auth/logout/' && this.perderRespuestaLogout) {
      throw new TypeError('Failed to fetch');
    }
    const entregar = () => {
      if (respuesta.cookie !== undefined) this.frasco.refresh = respuesta.cookie;
      return new Response(respuesta.cuerpo === undefined ? null : JSON.stringify(respuesta.cuerpo), {
        status: respuesta.estado,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    if (!this.retenidas.has(ruta)) return entregar();
    return new Promise((resolver) => {
      this.pendientes.push({ ruta, entregar: () => resolver(entregar()) });
    });
  };

  private emitirRefresh(usuario: UsuarioFalso): string {
    const refresh = `R${++this.contador}`;
    this.refreshVigentes.set(refresh, usuario);
    return refresh;
  }

  private emitirAccess(usuario: UsuarioFalso): string {
    const access = `A${++this.contador}`;
    this.accessVigentes.set(access, usuario);
    return access;
  }

  private async atender(ruta: string, peticion: Request, cookie: string | null): Promise<Respuesta> {
    if (ruta.startsWith('POST /api/auth/')) {
      if (!peticion.headers.get('Content-Type')?.startsWith('application/json')) {
        return { estado: 415, cuerpo: { detail: 'Tipo de medio no soportado.', code: 'unsupported_media_type' } };
      }
      if (this.rechazarOrigen) {
        return { estado: 403, cuerpo: { detail: 'Origen no permitido.', code: 'origen_no_permitido' } };
      }
    }
    switch (ruta) {
      case 'POST /api/auth/token/':
        return this.login((await peticion.json()) as { email: string; password: string });
      case 'POST /api/auth/refresh/':
        return this.refresh(cookie);
      case 'POST /api/auth/logout/':
        if (cookie) this.listaNegra.add(cookie);
        return { estado: 204, cookie: null };
      case 'GET /api/auth/yo/':
      case 'GET /api/viajes/':
      case 'POST /api/viajes/': {
        const access = peticion.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
        const usuario = this.accessVigentes.get(access);
        if (!usuario) return { estado: 401, cuerpo: { detail: 'Token inválido.', code: 'token_not_valid' } };
        if (ruta === 'GET /api/auth/yo/') return { estado: 200, cuerpo: publico(usuario) };
        if (ruta === 'POST /api/viajes/') return { estado: 201, cuerpo: { recibido: await peticion.json() } };
        return { estado: 200, cuerpo: { count: 0, next: null, previous: null, results: [] } };
      }
      default:
        return { estado: 404, cuerpo: { detail: 'No encontrado.' } };
    }
  }

  private login({ email, password }: { email: string; password: string }): Respuesta {
    if (this.limitarLogin) return { estado: 429, cuerpo: { detail: 'Demasiadas solicitudes.', code: 'throttled' } };
    const usuario = USUARIOS.find((u) => u.email === email);
    if (!usuario || usuario.password !== password) {
      return { estado: 401, cuerpo: { detail: 'Correo o contraseña incorrectos.', code: 'credenciales_invalidas' } };
    }
    if (usuario.bloqueado) return { estado: 401, cuerpo: { detail: 'Bloqueada.', code: 'cuenta_bloqueada' } };
    if (usuario.rol === 'CONDUCTOR') {
      return { estado: 403, cuerpo: { detail: 'No corresponde a tu rol.', code: 'rol_no_permitido' } };
    }
    return {
      estado: 200,
      cuerpo: { access: this.emitirAccess(usuario), usuario: publico(usuario) },
      cookie: this.emitirRefresh(usuario),
    };
  }

  private refresh(cookie: string | null): Respuesta {
    const usuario = cookie ? this.refreshVigentes.get(cookie) : undefined;
    if (!cookie || !usuario || this.listaNegra.has(cookie)) {
      return { estado: 401, cuerpo: { detail: 'La sesión no es válida o expiró.', code: 'sesion_invalida' } };
    }
    if (this.sesionesExpiradas.has(cookie)) {
      return { estado: 401, cuerpo: { detail: 'Duración máxima.', code: 'sesion_expirada' } };
    }
    this.listaNegra.add(cookie);
    return { estado: 200, cuerpo: { access: this.emitirAccess(usuario) }, cookie: this.emitirRefresh(usuario) };
  }
}

function publico(usuario: UsuarioFalso): Usuario {
  const { id, nombre, email, rol, empresa } = usuario;
  return { id, nombre, email, rol, empresa };
}
