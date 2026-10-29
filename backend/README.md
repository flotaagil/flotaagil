# backend/

API REST, WebSocket y tareas asíncronas de FlotaÁgil.

**Responsable:** Carlos Ortiz.

- Django 5.2 LTS + DRF 3.16 + GeoDjango (PostgreSQL 16 + PostGIS 3.4).
- Channels 4 + Daphne para WebSocket (posiciones GPS, panel en tiempo real); Redis 7.2 como capa de canales, caché y broker.
- Celery 5.5 (worker y beat): expiración de reservas, timeout de 60 s, monitoreo de vuelos, retención de datos.
- Integraciones: Twilio WhatsApp, API de vuelos y geocodificador (detrás de adaptadores), Sentry.
- Modelos según el diccionario de datos ([`docs/diccionario-datos.md`](../docs/diccionario-datos.md)); los agregados y desvíos están en [`docs/diccionario-cambios.md`](../docs/diccionario-cambios.md).

Pruebas: pytest + pytest-django + coverage (≥ 70 % en módulos de negocio), Ruff y Bandit.

## Estructura

```
config/            settings (todo por variables de entorno), urls, asgi, wsgi
apps/comun/        validadores (RUT, kebab-case), permisos por rol, aislamiento por empresa (RN-13)
apps/cuentas/      EMPRESA, CONFIGURACION_EMPRESA, USUARIO; autenticación JWT; datos_demo
apps/flota/        CONDUCTOR, VEHICULO, CONDUCTOR_VEHICULO
apps/convenios/    CONVENIO
apps/reservas/     PASAJERO, VIAJE, HISTORIAL_ESTADO; máquina de estados; API de reservas (HU-03)
apps/aeropuerto/   VUELO
apps/auditoria/    AUDITORIA (solo inserción, protegida también con un trigger en la base)
apps/integraciones/  geocodificador (desarrollo determinístico o Google Geocoding)
openapi.yaml       esquema OpenAPI generado (contrato de la API)
```

## Desarrollo local

Requisitos: Docker Desktop (con WSL2). Todo corre en contenedores (`infra/docker-compose.dev.yml`): PostgreSQL + PostGIS, Redis y Django con GDAL/GEOS/PROJ de Debian. El código está montado y `runserver` recarga al guardar.

Desde la raíz del repositorio:

```
copy backend\.env.example backend\.env                     # una sola vez
docker compose -f infra/docker-compose.dev.yml up -d --build  # levanta db, redis y backend (migra al iniciar)
docker compose -f infra/docker-compose.dev.yml exec backend python manage.py datos_demo
```

- API: http://localhost:8000/api/ · Swagger (solo con DEBUG): http://localhost:8000/api/docs/
- Usuarios demo: `admin@`, `despacho@`, `conductor1@`…`conductor4@` en `transportes-andes.example` y `taxi-pacifico.example`; contraseña: `DATOS_DEMO_PASSWORD` del `.env`.
- Admin de mantenimiento interno: `python manage.py createsuperuser` y http://localhost:8000/admin/.

Comandos frecuentes (prefijo `docker compose -f infra/docker-compose.dev.yml`):

| Tarea | Comando |
|---|---|
| Pruebas con cobertura | `run --rm backend pytest --cov --cov-fail-under=70` |
| Lint y formato | `run --rm --no-deps backend ruff check .` · `... ruff format --check .` |
| Seguridad | `run --rm --no-deps backend bandit -r . -q -x ./.venv,./tests,*/tests/*,*/migrations/*` |
| Migraciones | `run --rm --no-deps backend python manage.py makemigrations` |
| Regenerar OpenAPI | `run --rm --no-deps backend python manage.py spectacular --file openapi.yaml --validate --fail-on-warn` |
| Logs | `logs -f backend` |
| Detener | `down` (agrega `-v` para borrar la base de datos) |

El `.venv` local (`py -3.12 -m venv backend\.venv` + `pip install -r backend\requirements-dev.txt`) es solo para el editor; no hace falta GDAL en Windows.

`datos_demo` es idempotente. Para volver a cargar todo desde cero hay que borrar la base (`down -v` y `up -d`): AUDITORIA es de solo inserción y no permite borrar los usuarios que la referencian.

## Reservas (HU-03)

Solo administrador y despachador, y solo viajes de su empresa (RN-13).

| Operación | Endpoint | Notas |
|---|---|---|
| Listar | `GET /api/viajes/` | Filtros: `estado` (repetible), `fecha` (día local), `desde`/`hasta`, `sentido`, `canal`, `q` (pasajero, teléfono, dirección, vuelo), `ordenar` |
| Ingresar | `POST /api/viajes/` | Queda en SOLICITADO. Vuelo solo si el sentido es DESDE_AEROPUERTO. Origen dentro de la zona de operación |
| Ver | `GET /api/viajes/{id}/` | Incluye el historial de estados |
| Editar | `PATCH /api/viajes/{id}/` | Solo en PENDIENTE_CONFIRMACION o SOLICITADO; si no, 409 |
| Cancelar | `POST /api/viajes/{id}/cancelar/` | Exige `motivo`; registra HISTORIAL_ESTADO y AUDITORIA; desde estados no cancelables, 409 |

Las transiciones de estado están en `apps/reservas/estados.py`, que es el único lugar que cambia `VIAJE.estado`.

## Portal público (HU-19)

Sin autenticación. La empresa se identifica por su `slug` (DC-01).

| Operación | Endpoint | Notas |
|---|---|---|
| Datos de la empresa | `GET /api/portal/{slug}/` | Razón social, anticipación mínima y plazo de verificación; 404 si no existe o está inactiva |
| Solicitar viaje | `POST /api/portal/{slug}/solicitudes/` | Queda en PENDIENTE_CONFIRMACION; responde `expira_en` |

Protección: throttling por IP (`THROTTLE_PORTAL_MINUTO`, `THROTTLE_PORTAL_HORA`; caché en Redis), máximo de solicitudes por teléfono y empresa (`PORTAL_MAX_SOLICITUDES_POR_TELEFONO` en `PORTAL_VENTANA_TELEFONO_MIN`), campo trampa `sitio_web` y anticipación mínima por empresa (DC-10). Desde el aeropuerto, si no viene `recogida_en` se calcula como llegada del vuelo + margen nacional (RN-17, DC-12).

La verificación por WhatsApp está simulada (`apps/integraciones/notificaciones.py`, solo deja un log con el número enmascarado); Twilio es HU-20. Las solicitudes no confirmadas se cancelan al vencer el plazo (RN-06) con `python manage.py expirar_pendientes`, que el servicio `programador` del compose ejecuta cada 60 s.

## Autenticación

| Canal | Login | Renovación | Roles |
|---|---|---|---|
| Panel web | `POST /api/auth/token/` → `access` en la respuesta, refresh en cookie `refresh_panel` (httpOnly, SameSite=Lax, Secure en producción, `Path=/api/auth/`) | `POST /api/auth/refresh/` (cookie, con rotación) · `POST /api/auth/logout/` | Administrador, despachador |
| App del conductor | `POST /api/auth/app/token/` → `access` y `refresh` en la respuesta | `POST /api/auth/app/refresh/` con `{"refresh"}` | Conductor |

Access de 15 min y refresh de 12 h (`JWT_ACCESS_MIN`, `JWT_REFRESH_HORAS`). Al quinto intento fallido la cuenta se bloquea `LOGIN_BLOQUEO_MIN` minutos. En desarrollo la web usa el proxy de Vite (`/api` → `localhost:8000`) para quedar en el mismo origen que la cookie.
