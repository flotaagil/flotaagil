# docs/

Índice de la documentación de FlotaÁgil. La fuente de verdad es el Informe 2 (ES2).

| Ruta | Contenido |
|---|---|
| [`backlog/backlog.json`](backlog/backlog.json) | Product backlog: 25 HU + H-3 (178 SP) |
| [`sprint0.md`](sprint0.md) | Instrucciones del Sprint 0 (ecosistema GitHub) |
| [`sprint0_github.py`](sprint0_github.py) | Script idempotente que creó labels, milestones, tablero e issues del Sprint 0 |
| [`evidencias/`](evidencias/) | Evidencias de ejecución de casos de prueba (CP-xx) |

Se agregarán: informes, registro de decisiones, informe de la PoC de GPS (H-3), runbook y resultados de pruebas de carga y seguridad.

## Pendientes de configuración

- [ ] **Quitar el bypass temporal del ruleset «Proteger main»** (rol de administrador de la organización, modo «solo pull request») cuando Carlos Ortiz se sume al repositorio. Desde ese momento todo PR requiere la aprobación del otro integrante.
- [ ] Descomentar en `.github/CODEOWNERS` las líneas de Carlos para `backend/` e `infra/`.
- [ ] Activar en `.github/dependabot.yml` las entradas `pip`, `npm` y `docker` cuando existan los manifiestos.
