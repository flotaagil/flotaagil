# Pendientes para el refinamiento

Lo que quedó abierto durante el Sprint 1 y todavía no tiene issue. Cada fila dice si es una **solicitud de cambio** (cambia alcance, reglas o contrato: issue con la plantilla «Solicitud de cambio», decisión del PO) o una **tarea técnica** (no agrega funcionalidad: issue `tipo:tarea`). Los SP son una **estimación sugerida** para discutir en el refinamiento, en la misma escala del backlog.

Los PR-01 a PR-05 también están en «Pendientes por revisar» de `docs/diccionario-cambios.md` (llega a `main` con las ramas del backend y de la web).

| # | Tema | Tipo | Rama donde se detectó | SP sugeridos |
|---|---|---|---|---|
| PR-01 | RN-15 y AUDITORIA | Solicitud de cambio | `feat/HU-03-reservas` | 2 |
| PR-02 | Logout de la app del conductor | Tarea técnica | `feat/HU-19-portal` | 2 |
| PR-03 | Corregir el teléfono del pasajero al editar (HU-03) | Solicitud de cambio | `feat/HU-03-web` | 3 |
| PR-04 | Texto del aviso de privacidad (HU-19) | Tarea técnica | `feat/HU-19-web` | 1 |
| PR-05 | Portal en inglés (HU-19) | Solicitud de cambio | `feat/HU-19-web` | 5 |
| T-01 | Clave de idempotencia en las solicitudes del portal | Tarea técnica | `feat/HU-19-web` | 3 |
| T-02 | Revisión de desfase del esquema OpenAPI en el CI | Tarea técnica | `chore/web-base` | 1 |
| T-03 | Polígono real de la Región Metropolitana | Tarea técnica | `feat/backend-base` | 3 |

Total sugerido: 20 SP (10 de tareas técnicas y 10 de solicitudes de cambio, estas últimas sujetas a la decisión del PO).

## PR-01 · RN-15 y AUDITORIA

- **Tipo:** solicitud de cambio. Dos reglas del informe chocan y la decisión es del PO.
- **Motivo:** RN-15 fija la retención de «eventos 90 días». Si AUDITORIA cuenta como evento, su purga choca con RN-12 (auditoría inmutable) y con el trigger `auditoria_sin_cambios`, que impide borrar filas. Hay que definir si AUDITORIA queda fuera de RN-15 (retención indefinida o propia) o si la purga se hace con un procedimiento controlado que desactive el trigger y deje constancia. Mientras no se decida, AUDITORIA no se purga.
- **Detectado en:** `feat/HU-03-reservas`, al registrar la auditoría de la cancelación.
- **SP sugeridos:** 2 (la decisión y, si corresponde, el procedimiento de purga con su prueba).

## PR-02 · Logout de la app del conductor

- **Tipo:** tarea técnica. Completa la autenticación de la app; no cambia el alcance.
- **Motivo:** la app no tiene logout en el servidor (`/api/auth/app/`), así que su refresh no se puede invalidar antes de que venza. Un teléfono perdido sigue con sesión hasta el vencimiento.
- **Detectado en:** `feat/HU-19-portal`, en la revisión de la autenticación por canal.
- **SP sugeridos:** 2 (endpoint, lista negra del refresh de la app y prueba). Puede ir dentro de la primera HU de la app del conductor.

## PR-03 · Corregir el teléfono del pasajero al editar

- **Tipo:** solicitud de cambio. Cambia el contrato del PATCH y el criterio de edición de HU-03.
- **Motivo:** el PATCH de `/api/viajes/{id}/` no acepta `pasajero`, así que el panel muestra el pasajero y su teléfono en solo lectura. Un teléfono mal ingresado manda los avisos de WhatsApp a otra persona. Evaluar permitir la corrección mientras la reserva sea editable, con auditoría, y decidir qué pasa con el PASAJERO compartido por teléfono (corregir el registro o reasignar la reserva a otro pasajero).
- **Detectado en:** `feat/HU-03-web`, al revisar el contrato real del PATCH.
- **SP sugeridos:** 3 (backend con auditoría, formulario del panel y pruebas).

## PR-04 · Texto del aviso de privacidad

- **Tipo:** tarea técnica (contenido). Termina un criterio de HU-19 sin cambiar su alcance.
- **Motivo:** no hay un texto aprobado. El portal muestra un borrador (`web/src/portal/Privacidad.tsx`) con la franja «Texto provisional, pendiente de aprobación», junto a la aceptación y en `/solicitar/{slug}/privacidad`. Falta el texto final validado (responsable, datos, finalidad, encargados, plazos de RN-15, derechos y normativa citada) y quitar la franja.
- **Detectado en:** `feat/HU-19-web`.
- **SP sugeridos:** 1 (el reemplazo del texto; la redacción y validación legal quedan fuera de los SP).

## PR-05 · Portal en inglés

- **Tipo:** solicitud de cambio. Agrega funcionalidad fuera del backlog; requiere su propia HU.
- **Motivo:** el portal está solo en español, pero muchos pasajeros que piden desde el aeropuerto son turistas. Incluye los textos del portal, los mensajes de error del backend que el portal muestra, las plantillas de WhatsApp y un selector de idioma.
- **Detectado en:** `feat/HU-19-web`.
- **SP sugeridos:** 5.

## T-01 · Clave de idempotencia en las solicitudes del portal

- **Tipo:** tarea técnica. Robustez del contrato existente; no agrega funcionalidad.
- **Motivo:** `POST /api/portal/{slug}/solicitudes/` no es idempotente. Si la respuesta se pierde (red, 502–504 o un 500 después de guardar), el portal dice «No sabemos si tu solicitud llegó» y reenviar puede duplicar la reserva y el WhatsApp de verificación. Hoy solo lo acota el límite por teléfono (3 cada 15 min). Propuesta: encabezado `Idempotency-Key` generado por el formulario, guardado con la solicitud por un tiempo corto; un reenvío con la misma clave devuelve la respuesta original.
- **Detectado en:** `feat/HU-19-web` (riesgo del plan; el reenvío pide confirmación mientras tanto).
- **SP sugeridos:** 3 (backend, portal y pruebas).

## T-02 · Revisión de desfase del esquema en el CI

- **Tipo:** tarea técnica.
- **Motivo:** el CI no verifica que `backend/openapi.yaml` corresponda al código ni que `web/src/api/esquema.d.ts` corresponda a `openapi.yaml`. Un cambio en el backend sin regenerar el esquema, o en el esquema sin regenerar los tipos, pasa el CI y rompe la web en ejecución. Propuesta: en el job de backend, `python manage.py spectacular --file openapi.yaml --validate --fail-on-warn` seguido de `git diff --exit-code openapi.yaml`; en el de web, `npm run gen:api` seguido de `git diff --exit-code src/api/esquema.d.ts`.
- **Detectado en:** `chore/web-base` (se comprobó a mano que `gen:api` no deja diferencias, pero el CI no lo exige).
- **SP sugeridos:** 1.

## T-03 · Polígono real de la Región Metropolitana

- **Tipo:** tarea técnica. Cumple mejor la restricción «Dentro de la RM» que ya está en el informe.
- **Motivo:** la zona de operación es un rectángulo aproximado (DC-02) que también incluye zonas de regiones vecinas (Valparaíso, San Antonio, Rancagua): un origen ahí pasa la validación. Propuesta: el polígono real de la RM como GEOCERCA (PostGIS), configurable por empresa, y validar `VIAJE.origen_geo` contra él.
- **Detectado en:** `feat/backend-base`.
- **SP sugeridos:** 3 (datos del polígono, migración, validación y pruebas).
