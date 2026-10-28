import type {
  BackgroundGeolocationPlugin,
  CallbackError,
  Location,
} from '@capacitor-community/background-geolocation';
import { registerPlugin } from '@capacitor/core';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

/**
 * Inicia el servicio de ubicación en primer plano (notificación fija en Android).
 * distanceFilter 0 hace que el plugin entregue posiciones aunque el teléfono esté quieto.
 */
export function iniciarRastreo(
  alRecibir: (posicion: Location) => void,
  alFallar: (error: CallbackError) => void,
): Promise<string> {
  return BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: 'FlotaÁgil: prueba de GPS',
      backgroundMessage: 'Registrando tu ubicación para la prueba H-3. Detén la sesión para terminar.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 0,
    },
    (posicion, error) => {
      if (error) alFallar(error);
      else if (posicion) alRecibir(posicion);
    },
  );
}

export const detenerRastreo = (id: string) => BackgroundGeolocation.removeWatcher({ id });

export const abrirAjustes = () => BackgroundGeolocation.openSettings();

export type { CallbackError, Location };
