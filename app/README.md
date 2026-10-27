# app/

App del conductor de FlotaÁgil.

**Responsable:** Renato González.

- React + Capacitor 7 + background-geolocation.
- Solo Android 10+ (API 29–35).
- Estado Disponible/No disponible con selección de vehículo, recepción y aceptación de viajes (60 s), estados del viaje, registro de pago, navegación con Google Maps o Waze, Mi Turno.
- La ubicación se envía solo en turno y con consentimiento informado (RN-18). Meta: consumo < 50 MB por turno de 8 h.

La prueba de concepto de GPS en segundo plano (H-3) es la primera tarea del Sprint 1; su informe va en `docs/`.

Nunca subas keystores (`*.jks`, `*.keystore`) ni `local.properties`.
