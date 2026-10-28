import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import {
  aEvento,
  aMuestra,
  ENCABEZADO_EVENTOS,
  ENCABEZADO_MUESTRAS,
  filaEvento,
  filaMuestra,
  parsear,
} from './csv';
import type { Evento, Muestra } from './tipos';

/** Mediciones guardadas solo en el teléfono, en el almacenamiento privado de la app. */
const DIRECTORIO = Directory.Data;
const CARPETA = 'poc-gps';
const MUESTRAS = `${CARPETA}/posiciones.csv`;
const EVENTOS = `${CARPETA}/eventos.csv`;
const ESTADO = `${CARPETA}/estado.json`;

/** Marca de orden de bytes: Excel la necesita para abrir el CSV como UTF-8. */
const BOM = '\uFEFF';

/** Sesión en curso, para detectar al reabrir la app que se cerró sin detenerla. */
export interface EstadoSesion {
  sesion: string;
  inicio_ms: number;
  ultima_muestra_ms: number | null;
}

// Las escrituras se encadenan para que dos anexos simultáneos no creen el encabezado dos veces.
let cola: Promise<unknown> = Promise.resolve();
function enCola<T>(tarea: () => Promise<T>): Promise<T> {
  const resultado = cola.then(tarea, tarea);
  cola = resultado.catch(() => undefined);
  return resultado;
}

async function existe(path: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path, directory: DIRECTORIO });
    return true;
  } catch {
    return false;
  }
}

async function leer(path: string): Promise<string | null> {
  if (!(await existe(path))) return null;
  const { data } = await Filesystem.readFile({ path, directory: DIRECTORIO, encoding: Encoding.UTF8 });
  return typeof data === 'string' ? data : await data.text();
}

function anexar(path: string, encabezado: string, linea: string): Promise<void> {
  return enCola(async () => {
    if (!(await existe(path))) {
      await Filesystem.writeFile({
        path,
        directory: DIRECTORIO,
        data: `${encabezado}\n`,
        encoding: Encoding.UTF8,
        recursive: true,
      });
    }
    await Filesystem.appendFile({ path, directory: DIRECTORIO, data: `${linea}\n`, encoding: Encoding.UTF8 });
  });
}

export const guardarMuestra = (m: Muestra) => anexar(MUESTRAS, ENCABEZADO_MUESTRAS, filaMuestra(m));
export const guardarEvento = (e: Evento) => anexar(EVENTOS, ENCABEZADO_EVENTOS, filaEvento(e));

export async function leerMuestras(): Promise<Muestra[]> {
  const texto = await leer(MUESTRAS);
  return texto ? parsear(texto).map(aMuestra) : [];
}

export async function leerEventos(): Promise<Evento[]> {
  const texto = await leer(EVENTOS);
  return texto ? parsear(texto).map(aEvento) : [];
}

export async function leerEstado(): Promise<EstadoSesion | null> {
  const texto = await leer(ESTADO);
  return texto ? (JSON.parse(texto) as EstadoSesion) : null;
}

export function guardarEstado(estado: EstadoSesion | null): Promise<void> {
  return enCola(async () => {
    if (estado === null) {
      if (await existe(ESTADO)) await Filesystem.deleteFile({ path: ESTADO, directory: DIRECTORIO });
      return;
    }
    await Filesystem.writeFile({
      path: ESTADO,
      directory: DIRECTORIO,
      data: JSON.stringify(estado),
      encoding: Encoding.UTF8,
      recursive: true,
    });
  });
}

/**
 * Comparte los CSV con el menú de Android (correo, Drive, etc.). Se copian antes a la caché
 * porque el FileProvider de Capacitor solo expone la caché y el almacenamiento externo.
 */
export async function exportar(): Promise<boolean> {
  const archivos: string[] = [];
  for (const path of [MUESTRAS, EVENTOS]) {
    const texto = await leer(path);
    if (texto === null) continue;
    const destino = `${CARPETA}/${path.split('/').pop()}`;
    await Filesystem.writeFile({
      path: destino,
      directory: Directory.Cache,
      data: `${BOM}${texto}`,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    archivos.push((await Filesystem.getUri({ path: destino, directory: Directory.Cache })).uri);
  }
  if (archivos.length === 0) return false;
  await Share.share({ title: 'Mediciones PoC GPS (H-3)', files: archivos });
  return true;
}

export function borrarTodo(): Promise<void> {
  return enCola(async () => {
    if (await existe(CARPETA)) {
      await Filesystem.rmdir({ path: CARPETA, directory: DIRECTORIO, recursive: true });
    }
  });
}
