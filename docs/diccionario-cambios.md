# Cambios respecto del diccionario de datos (Anexo D)

Agregados y desvíos de la implementación respecto de [`diccionario-datos.md`](diccionario-datos.md), para actualizar el Anexo D del informe en la ES2. Cada entrada indica la decisión, su motivo y el estado de implementación. Cuando las ramas se fusionen, la columna «Estado» debe indicar el número del PR en vez del nombre de la rama.

| # | Fecha | Tipo | Tabla | Cambio | Motivo | Estado |
|---|---|---|---|---|---|---|
| DC-01 | 2026-10-29 | Agregado | EMPRESA | Columna `slug` | El portal público necesita identificar la empresa en la URL (`/solicitar/<slug>`) | Implementado (feat/backend-base) |
| DC-02 | 2026-10-29 | Agregado | CONFIGURACION_EMPRESA (nueva) | Tabla 1:1 con EMPRESA con los parámetros configurables | CLAUDE.md exige que los valores supuestos sean parámetros por empresa, no constantes en el código | Implementado (feat/backend-base) |
| DC-03 | 2026-10-29 | Desvío de dominio | HISTORIAL_ESTADO | `actor` agrega `ADMINISTRADOR` | El administrador también puede cambiar estados (p. ej., cancelar); registrarlo como DESPACHADOR falsearía el historial | Implementado (feat/HU-03-reservas) |
| DC-04 | 2026-10-29 | Agregado técnico | USUARIO | Columnas y tablas del sistema de autenticación de Django | Propias del framework; se usan solo para el admin de mantenimiento interno | Implementado (feat/backend-base) |
| DC-05 | 2026-10-29 | Decisión de diseño | VIAJE | Coordenadas obtenidas con un geocodificador detrás de un adaptador | `origen_geo` y `destino_geo` son NOT NULL y los formularios capturan direcciones en texto | Implementado (feat/HU-03-reservas) |
| DC-06 | 2026-10-29 | Precisión de uso | VUELO | Solo se crea para viajes `DESDE_AEROPUERTO`; `hora_programada` la informa el pasajero o el despachador | `hora_programada` es la hora de llegada que usan RN-17 y HU-27; HU-26 la valida o corrige | Implementado en el panel (feat/HU-03-reservas) y en el portal (feat/HU-19-portal) |
| DC-07 | 2026-10-29 | Supuesto | USUARIO | Duración del bloqueo tras 5 intentos fallidos: 15 min, configurable (`LOGIN_BLOQUEO_MIN`) | El Anexo D define el bloqueo al llegar a 5 intentos, pero no su duración | Implementado (feat/backend-base) |
| DC-08 | 2026-10-29 | Desvío de dominio | VIAJE | `origen_cancelacion` agrega `ADMINISTRADOR` | Igual que en DC-03: el administrador también cancela desde el panel; registrarlo como DESPACHADOR falsearía el origen | Implementado (feat/HU-03-reservas) |
| DC-09 | 2026-10-29 | Corrección de tipo | VIAJE, HISTORIAL_ESTADO | `estado`, `estado_anterior` y `estado_nuevo` pasan de VARCHAR(20) a VARCHAR(22) | `PENDIENTE_CONFIRMACION` tiene 22 caracteres y no cabe en VARCHAR(20) | Implementado (feat/HU-03-reservas) |
| DC-10 | 2026-10-29 | Agregado | CONFIGURACION_EMPRESA | `anticipacion_minima_min` SMALLINT NOT NULL, defecto 30 | Anticipación mínima de una solicitud del portal, configurable por empresa | Implementado (feat/HU-19-portal) |
| DC-11 | 2026-10-29 | Agregado | PASAJERO | `privacidad_aceptada_en` TIMESTAMPTZ NULL | Evidencia de la aceptación del aviso de privacidad (HU-19) | Implementado (feat/HU-19-portal) |
| DC-12 | 2026-10-29 | Supuesto | VUELO | Sin distinción nacional/internacional: la recogida calculada (RN-17) usa `margen_nacional_min` | El Anexo D no tiene columna que distinga el tipo de vuelo | Implementado (feat/HU-19-portal); revisar en HU-27 |

## DC-01 · EMPRESA.slug

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| slug | VARCHAR(50) | No | UK | Identificador de la empresa en la URL del portal | kebab-case: `^[a-z0-9]+(-[a-z0-9]+)*$`; único | — |  |

## DC-02 · CONFIGURACION_EMPRESA

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| empresa_id | BIGINT | No | PK, FK | Empresa | → EMPRESA.id (1:1) | — |  |
| margen_nacional_min | SMALLINT | No |  | Margen sobre la ETA para vuelos nacionales (RN-17) | ≥ 0 | 20 |  |
| margen_internacional_min | SMALLINT | No |  | Margen sobre la ETA para vuelos internacionales (RN-17) | ≥ 0 | 35 |  |
| tolerancia_fila_min | SMALLINT | No |  | Tiempo fuera de la geocerca antes de salir de la fila (HU-29) | ≥ 0 | 10 |  |
| espera_no_presentacion_min | SMALLINT | No |  | Espera en EN_ZONA antes de cancelar por no presentación | ≥ 0 | 15 |  |
| expiracion_verificacion_min | SMALLINT | No |  | Expiración de PENDIENTE_CONFIRMACION (RN-06) | ≥ 1 | 15 |  |
| zona_lat_min | NUMERIC(9,6) | No |  | Latitud mínima de la zona de operación | −90 a 90; < `zona_lat_max` | −34.300000 |  |
| zona_lat_max | NUMERIC(9,6) | No |  | Latitud máxima de la zona de operación | −90 a 90 | −32.920000 |  |
| zona_lon_min | NUMERIC(9,6) | No |  | Longitud mínima de la zona de operación | −180 a 180; < `zona_lon_max` | −71.720000 |  |
| zona_lon_max | NUMERIC(9,6) | No |  | Longitud máxima de la zona de operación | −180 a 180 | −69.770000 |  |

Relación: EMPRESA 1:1 CONFIGURACION_EMPRESA. Se crea junto con la empresa con los valores por defecto.

La zona de operación es un rectángulo (lat/lon mínimos y máximos) que valida «Dentro de la RM» en `VIAJE.origen_geo` y acota las coordenadas del geocodificador de desarrollo. Los valores por defecto son un rectángulo **aproximado** que contiene la Región Metropolitana; cada empresa puede ajustarlo.

**Limitación.** Es un rectángulo envolvente, no el límite real de la región: también incluye zonas de regiones vecinas, por ejemplo Valparaíso y San Antonio (Región de Valparaíso) y Rancagua (Región de O'Higgins). Un origen en esas zonas pasa la validación. El polígono real de la RM (p. ej. como GEOCERCA) queda para más adelante.

## DC-03 · HISTORIAL_ESTADO.actor

Dominio: `CONDUCTOR | DESPACHADOR | ADMINISTRADOR | PASAJERO | SISTEMA` (se agrega `ADMINISTRADOR`). `usuario_id` sigue identificando al usuario responsable cuando el actor tiene cuenta.

## DC-04 · Columnas técnicas de Django en USUARIO

USUARIO se implementa sobre el modelo de autenticación de Django. Además de las columnas del Anexo D, el framework agrega:

| Elemento | Tipo | Uso |
|---|---|---|
| `last_login` | TIMESTAMPTZ, nulo | Último inicio de sesión |
| `is_superuser` | BOOLEAN | Acceso total al admin de mantenimiento |
| `is_staff` | BOOLEAN | Acceso al admin de mantenimiento |
| `usuario_groups`, `usuario_user_permissions` | Tablas intermedias | Grupos y permisos del framework |

Correspondencias: `password_hash` es la columna `password` de Django (PBKDF2-SHA256 con salt, mismo formato); `activo` reemplaza a `is_active`. El admin de Django se usa solo para mantenimiento interno; los usuarios del sistema operan desde el panel web.

## DC-05 · Geocodificador

No agrega columnas. `origen_geo` y `destino_geo` siguen NOT NULL. Las direcciones en texto se convierten en coordenadas mediante un adaptador con dos implementaciones:

- **Desarrollo:** coordenadas aproximadas y determinísticas por texto (la misma dirección da siempre el mismo punto) dentro del límite de la Región Metropolitana.
- **Google Geocoding:** se activa cuando existe la API key en la configuración del entorno.

La restricción «Dentro de la RM» de `VIAJE.origen_geo` se valida contra la zona de operación de la empresa (`CONFIGURACION_EMPRESA.zona_*`, ver DC-02), por defecto un rectángulo aproximado de la RM.

## DC-06 · VUELO

- Se crea solo para viajes con `sentido = DESDE_AEROPUERTO` (vuelos de llegada). Para `HACIA_AEROPUERTO` no se crea VUELO.
- `hora_programada` la informa quien ingresa la reserva (portal o despachador); `fecha` es la fecha local de esa hora. HU-26 la valida contra la API de vuelos y la corrige.

## DC-08 · VIAJE.origen_cancelacion

Dominio: `PASAJERO | DESPACHADOR | ADMINISTRADOR | SUPERVISOR | SISTEMA` (se agrega `ADMINISTRADOR`). En una cancelación desde el panel, el origen corresponde al rol de quien cancela; el usuario exacto queda además en HISTORIAL_ESTADO y AUDITORIA.

## DC-09 · Largo de los estados del viaje

`VIAJE.estado`, `HISTORIAL_ESTADO.estado_anterior` y `HISTORIAL_ESTADO.estado_nuevo` son VARCHAR(22): el valor `PENDIENTE_CONFIRMACION` tiene 22 caracteres. Hay que corregir el Anexo D (dice VARCHAR(20)).

## Pendientes por revisar

| # | Tema | Detalle |
|---|---|---|
| PR-01 | RN-15 y AUDITORIA | RN-15 fija la retención de «eventos 90 días». Si AUDITORIA cuenta como evento, su purga choca con RN-12 (auditoría inmutable) y con el trigger `auditoria_sin_cambios`, que impide borrar filas. Definir si AUDITORIA queda fuera de RN-15 (retención indefinida o propia) o si la purga se hace con un procedimiento controlado que desactive el trigger y deje constancia. Mientras no se decida, AUDITORIA no se purga. |
| PR-02 | Logout de la app del conductor | La app no tiene logout en el servidor (`/api/auth/app/`), así que su refresh no se puede invalidar antes de que venza. Queda para la HU de la app del conductor. |
| PR-03 | Teléfono del pasajero al editar (HU-03) | El PATCH de `/api/viajes/{id}/` no acepta `pasajero`, así que el panel no puede corregir el teléfono: se muestra en solo lectura. Un teléfono mal ingresado manda los avisos de WhatsApp a otra persona. Evaluar el cambio en el backend (p. ej. permitir corregir el pasajero mientras la reserva sea editable, con auditoría). |
