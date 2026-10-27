# backend/

API REST, WebSocket y tareas asíncronas de FlotaÁgil.

**Responsable:** Carlos Ortiz.

- Django 5.2 LTS + DRF 3.16 + GeoDjango (PostgreSQL 16 + PostGIS 3.4).
- Channels 4 + Daphne para WebSocket (posiciones GPS, panel en tiempo real); Redis 7.2 como capa de canales, caché y broker.
- Celery 5.5 (worker y beat): expiración de reservas, timeout de 60 s, monitoreo de vuelos, retención de datos.
- Integraciones: Twilio WhatsApp, API de vuelos (detrás de un adaptador), Sentry.
- Modelos según el diccionario de datos del Anexo D (español, singular).

Pruebas: pytest + pytest-django + coverage (≥ 70 % en módulos de negocio), Ruff y Bandit.

El andamiaje del proyecto Django es la primera tarea del Sprint 1.
