# FlotaÁgil

Plataforma SaaS para la gestión de flotas de taxi turismo: despacho de reservas, seguimiento GPS de conductores, verificación y avisos al pasajero por WhatsApp, recogidas en aeropuerto con monitoreo de vuelos y convenios corporativos.

Proyecto de Título TIHI84, INACAP La Granja.

## Equipo

| Persona | Rol | Área |
|---|---|---|
| Renato González ([@renatogonzalez08-source](https://github.com/renatogonzalez08-source)) | Developer | `web/`, `app/` |
| Carlos Ortiz | Scrum Master, líder, Developer | `backend/`, integraciones, `infra/` |
| Juan Pérez | Product Owner (integrante simulado) | Prioriza y acepta incrementos |

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Python 3.12, Django 5.2 LTS + DRF 3.16, GeoDjango, Channels 4 + Daphne, Celery 5.5, simplejwt 5, Gunicorn 23 |
| Datos | PostgreSQL 16 + PostGIS 3.4, Redis 7.2 |
| Web (panel y portal) | Node 22 LTS, TypeScript 5, React 19 + Vite 6 |
| App del conductor | React + Capacitor 7 + background-geolocation, Android 10+ (API 29–35) |
| Pruebas | pytest, coverage, Vitest, Playwright, k6, Bandit, Ruff, ESLint, OWASP ZAP |
| Infraestructura | Docker Compose, Nginx + Certbot, AWS EC2 t4g.small (ARM64), S3, Route 53, CloudWatch, SSM |
| Externos | Twilio WhatsApp Business API, FlightAware AeroAPI / AeroDataBox, Google Maps JS API, Sentry, UptimeRobot |

## Estructura

```
backend/   Django: API REST, WebSocket, Celery          responsable: Carlos
web/       React + Vite: panel y portal                  responsable: Renato
app/       React + Capacitor: app del conductor          responsable: Renato
infra/     docker-compose, nginx, runbook, inventario    responsable: Carlos
docs/      informes, decisiones, backlog, evidencias     ambos
.github/   CI, plantillas, Dependabot
```

## Backlog y tablero

- Backlog: [`docs/backlog/backlog.json`](docs/backlog/backlog.json), 25 HU + H-3 (178 SP) en 4 sprints de 2 semanas.
- Tablero: [FlotaÁgil — Backlog](https://github.com/orgs/flotaagil/projects/2) (GitHub Projects).

## Cómo contribuir

1. Toma un issue del tablero y crea una rama desde `main`: `feat/HU-03-reservas`, `fix/HU-16-monto-pago`, `chore/…`, `docs/…`, `test/…`. Una rama por HU o tarea.
2. Commits en [Conventional Commits](https://www.conventionalcommits.org/es/) en español, con scope del área: `feat(backend): crear modelo VIAJE`. Scopes permitidos: `backend`, `web`, `app`, `infra`, `docs`, `ci`, `deps`.
3. Abre un PR con el mismo formato en el título y `Closes #<issue>` en la descripción.
4. El PR necesita el check `ci` en verde y la revisión del otro integrante. Se fusiona con *squash*.
5. Nunca push directo a `main`: la rama está protegida.

Antes de pedir revisión, revisa la definición de terminado de la plantilla de PR. Nunca subas secretos: usa `.env.example` con valores de ejemplo.
