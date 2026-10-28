# app/

App del conductor de FlotaÁgil.

**Responsable:** Renato González.

- React 19 + Vite 6 + TypeScript + Capacitor 7 + `@capacitor-community/background-geolocation`.
- Solo Android 10+ (minSdk 29, targetSdk 35). appId `cl.flotaagil.conductor`.
- La ubicación se registra solo en turno y con consentimiento informado (RN-18). Meta: consumo < 50 MB por turno de 8 h.

## Estado actual: PoC de GPS (H-3)

Por ahora la app es la prueba de concepto de GPS en segundo plano. Registra posiciones cada 10 s (en viaje) o 30 s (en espera), las guarda en el teléfono y las exporta a CSV. El protocolo y la plantilla del informe están en [`docs/poc-gps.md`](../docs/poc-gps.md).

```
src/
  App.tsx                 pantalla principal: modo, iniciar/detener, resumen, exportar
  Consentimiento.tsx      aviso de uso de ubicación (RN-18)
  gps/rastreo.ts          plugin de ubicación (distanceFilter 0)
  gps/muestreo.ts         cuándo registrar y bytes estimados por mensaje
  gps/sesion.ts           sesión de medición: eventos, muestras, sesión interrumpida
  gps/almacen.ts          CSV en el teléfono y exportación con el menú de compartir
  gps/metricas.ts         intervalos, huecos, precisión, batería y datos
android/                  proyecto nativo de Capacitor
```

## Requisitos

- Node 22 LTS.
- JDK 21 (`JAVA_HOME` apuntando a él; no usar el JBR de Android Studio si es otra versión).
- Android Studio con SDK Platform 35, Build-Tools y Platform-Tools; `ANDROID_HOME` configurado.
- Teléfono Android 10+ con depuración USB.

## Comandos

```
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx cap sync android         # copia dist/ y plugins al proyecto nativo
npx cap run android          # instala en el teléfono conectado
npm run android              # build + sync + abre Android Studio
```

En Windows, si la ruta del repositorio tiene espacios, `npx cap run android` falla con «"gradlew" no se reconoce». Alternativa:

```
npm run build && npx cap sync android
cd android && gradlew.bat assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

En Xiaomi (HyperOS) hay que activar «Instalar vía USB» en Opciones de desarrollador y aceptar el diálogo de instalación antes de que termine su cuenta regresiva.

Nunca subas keystores (`*.jks`, `*.keystore`) ni `local.properties`.
