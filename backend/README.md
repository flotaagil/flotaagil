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

## Autenticación

| Canal | Login | Renovación | Roles |
|---|---|---|---|
| Panel web | `POST /api/auth/token/` → `access` en la respuesta, refresh en cookie `refresh_panel` (httpOnly, SameSite=Lax, Secure en producción, `Path=/api/auth/`) | `POST /api/auth/refresh/` (cookie, con rotación) · `POST /api/auth/logout/` | Administrador, despachador |
| App del conductor | `POST /api/auth/app/token/` → `access` y `refresh` en la respuesta | `POST /api/auth/app/refresh/` con `{"refresh"}` | Conductor |

Access de 15 min y refresh de 12 h (`JWT_ACCESS_MIN`, `JWT_REFRESH_HORAS`). Al quinto intento fallido la cuenta se bloquea `LOGIN_BLOQUEO_MIN` minutos. En desarrollo la web usa el proxy de Vite (`/api` → `localhost:8000`) para quedar en el mismo origen que la cookie.
