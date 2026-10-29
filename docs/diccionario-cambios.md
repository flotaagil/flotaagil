# Cambios respecto del diccionario de datos (Anexo D)

Agregados y desvíos de la implementación respecto de [`diccionario-datos.md`](diccionario-datos.md), para actualizar el Anexo D del informe en la ES2. Cada entrada indica la decisión, su motivo y el estado de implementación.

| # | Fecha | Tipo | Tabla | Cambio | Motivo | Estado |
|---|---|---|---|---|---|---|
| DC-01 | 2026-10-29 | Agregado | EMPRESA | Columna `slug` | El portal público necesita identificar la empresa en la URL (`/solicitar/<slug>`) | Implementado (feat/backend-base) |
| DC-02 | 2026-10-29 | Agregado | CONFIGURACION_EMPRESA (nueva) | Tabla 1:1 con EMPRESA con los parámetros configurables | CLAUDE.md exige que los valores supuestos sean parámetros por empresa, no constantes en el código | Implementado (feat/backend-base) |
| DC-03 | 2026-10-29 | Desvío de dominio | HISTORIAL_ESTADO | `actor` agrega `ADMINISTRADOR` | El administrador también puede cambiar estados (p. ej., cancelar); registrarlo como DESPACHADOR falsearía el historial | Pendiente (HU-03) |
| DC-04 | 2026-10-29 | Agregado técnico | USUARIO | Columnas y tablas del sistema de autenticación de Django | Propias del framework; se usan solo para el admin de mantenimiento interno | Implementado (feat/backend-base) |
| DC-05 | 2026-10-29 | Decisión de diseño | VIAJE | Coordenadas obtenidas con un geocodificador detrás de un adaptador | `origen_geo` y `destino_geo` son NOT NULL y los formularios capturan direcciones en texto | Pendiente |
| DC-06 | 2026-10-29 | Precisión de uso | VUELO | Solo se crea para viajes `DESDE_AEROPUERTO`; `hora_programada` la informa el pasajero o el despachador | `hora_programada` es la hora de llegada que usan RN-17 y HU-27; HU-26 la valida o corrige | Pendiente |
| DC-07 | 2026-10-29 | Supuesto | USUARIO | Duración del bloqueo tras 5 intentos fallidos: 15 min, configurable (`LOGIN_BLOQUEO_MIN`) | El Anexo D define el bloqueo al llegar a 5 intentos, pero no su duración | Implementado (feat/backend-base) |

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
