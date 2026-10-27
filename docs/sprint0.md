# Sprint 0: ecosistema GitHub de FlotaÁgil

Instrucciones para Claude Code. Ejecuta las etapas en orden. Al inicio de cada etapa di qué vas a hacer y espera mi confirmación. Si algo falla o no se puede hacer por API, detente y dime qué tengo que hacer en el navegador.

Datos fijos:
- Organización: `flotaagil` (ya existe, vacía). Dueño: `renatogonzalez08-source`.
- Repo: `flotaagil/flotaagil`, **público**, rama `main`.
- Carpeta local: esta (`C:\Users\renaa\Documents\PROYECTO DE TITULO GIT`). Windows, CMD.
- Carlos Ortiz se agrega después; aún no tengo su usuario.
- Backlog: `backlog.json` (25 HU + tarea H-3). No inventes historias ni cambies SP.

## Etapa 1. Permisos

1. `gh auth status`. Deben estar los scopes `repo`, `workflow`, `admin:org`, `project`. Si falta alguno: `gh auth refresh -h github.com -s repo,workflow,admin:org,project` (abre el navegador; espero).

## Etapa 2. Configuración de la organización

1. Por API (`gh api -X PATCH orgs/flotaagil`): `default_repository_permission=read`, `members_can_create_repositories=false`, descripción «Plataforma SaaS para la gestión de flotas de taxi turismo».
2. La exigencia de 2FA no se puede activar por API: dime que lo haga en Settings → Authentication security → «Require two-factor authentication».

## Etapa 3. Contenido inicial (local)

Crea la estructura y los archivos, sin código de aplicación todavía (el andamiaje de Django y React es la primera tarea del Sprint 1):

```
CLAUDE.md                      (ya está en la carpeta; muévelo a la raíz si no lo está)
README.md                      qué es, stack, estructura, cómo contribuir, enlace al tablero
.gitignore                     Python/Django, Node/Vite, Capacitor/Android (incluye *.keystore, *.jks, local.properties), .env (excepto .env.example), IDEs, SO. Ojo: no ignores lib/ ni build/ fuera de su contexto (anclar a la raíz o a la carpeta correcta).
.gitattributes                 * text=auto eol=lf; *.bat y *.cmd eol=crlf
.editorconfig                  utf-8, lf, 4 espacios en .py, 2 en ts/tsx/json/yml
backend/README.md              propósito y responsable (Carlos)
web/README.md                  panel y portal (Renato)
app/README.md                  app del conductor, Android 10+ (Renato)
infra/README.md                docker-compose, nginx, runbook (Carlos)
docs/README.md                 índice de documentación
docs/backlog/backlog.json      mover aquí el backlog.json
docs/evidencias/.gitkeep       evidencias de casos de prueba
.github/CODEOWNERS             por ahora todo a @renatogonzalez08-source; deja comentadas las líneas de Carlos para backend/ e infra/
.github/pull_request_template.md
.github/ISSUE_TEMPLATE/config.yml           blank_issues_enabled: false
.github/ISSUE_TEMPLATE/historia.yml
.github/ISSUE_TEMPLATE/defecto.yml
.github/ISSUE_TEMPLATE/solicitud-cambio.yml
.github/ISSUE_TEMPLATE/incidente.yml
.github/dependabot.yml
.github/workflows/ci.yml
```

Contenido de las plantillas (formularios YAML, en español):
- **historia.yml** (label `tipo:historia`): ID HU, historia (Como… quiero… para…), criterios de aceptación, SP, prioridad, reglas de negocio, casos de prueba, dependencias.
- **defecto.yml** (label `tipo:defecto`): HU o caso de prueba relacionado, pasos para reproducir, resultado esperado, resultado obtenido, evidencia, severidad (crítica/alta/media/baja), versión o commit.
- **solicitud-cambio.yml** (label `tipo:cambio`), RFC del Anexo J: solicitante, motivo, elemento afectado, urgencia, beneficio esperado, clasificación (estándar/normal/emergencia), análisis de impacto (alcance, SP, costo, calidad, riesgos), decisión, programación (sprint o ventana), pruebas y reversión, cierre.
- **incidente.yml** (label `tipo:incidente`): fecha y hora de detección, quién reporta, servicio y componente afectados, descripción y evidencia, impacto (alto/medio/bajo), urgencia (alta/media/baja), prioridad (P1–P4), responsable, acciones, hora de restablecimiento, causa, cierre.
- **pull_request_template.md:** issue que cierra (`Closes #`), qué cambia, cómo probarlo, y checklist de la DoD del CLAUDE.md.

**dependabot.yml:** por ahora solo `github-actions` (directorio `/`, semanal). Deja comentadas las entradas `pip` (`/backend`), `npm` (`/web`, `/app`) y `docker` (`/backend`, `/web`) para activarlas cuando existan los manifiestos.

**ci.yml** (en `pull_request` y `push` a `main`):
- Job `pr-title`: valida que el título del PR siga Conventional Commits (solo en `pull_request`), con scopes permitidos `backend`, `web`, `app`, `infra`, `docs`, `ci`, `deps`.
- Job `backend`: si existe `backend/requirements*.txt` o `backend/pyproject.toml`, levanta PostgreSQL 16 + PostGIS 3.4 y Redis 7 como servicios, instala, corre Ruff, Bandit y pytest con cobertura (falla bajo 70 %). Si no existe, pasa sin hacer nada.
- Job `web` y job `app`: si existe `package.json` en su carpeta, `npm ci`, ESLint, typecheck, Vitest, build. Si no, pasa.
- Job final `ci` que depende de todos y falla si alguno falló. Este es el check obligatorio.
- La detección de carpetas tiene que funcionar (no uses `hashFiles` en el `if` a nivel de job; usa un job previo con outputs o un paso que revise).
- Fija las acciones a versiones mayores (`actions/checkout@v4`, etc.).

Primer commit directo a `main` (es el único que no pasa por PR): `chore: estructura inicial del repositorio y Sprint 0`.

## Etapa 4. Repo en GitHub

1. `gh repo create flotaagil/flotaagil --public --source . --remote origin --description "Plataforma SaaS para la gestión de flotas de taxi turismo — Proyecto de Título INACAP"` y `git push -u origin main`.
2. `gh repo edit`: solo squash merge (usar título del PR como mensaje), sin merge commit ni rebase, borrar rama al fusionar, issues sí, wiki no, projects sí. Topics: `django`, `react`, `capacitor`, `postgis`, `saas`, `taxi`.
3. Seguridad (por API): secret scanning y push protection activados, alertas de Dependabot y actualizaciones de seguridad activadas, reporte privado de vulnerabilidades activado.

## Etapa 5. Ruleset de `main`

Crea un ruleset de repositorio «Proteger main» (activo, rama por defecto) con:
- Bloquear borrado y force push.
- Exigir pull request: 1 aprobación, descartar aprobaciones al haber nuevos commits, resolver conversaciones, método permitido solo squash.
- Exigir el check `ci` (y que la rama esté actualizada).
- Historial lineal.
- **Bypass temporal:** rol de administrador de la organización, modo «solo pull request», para que yo pueda fusionar mis PR mientras Carlos no esté. Déjalo anotado en `docs/README.md` como pendiente quitarlo cuando Carlos entre.

Verifica intentando un `git push` directo a `main` con un commit vacío: tiene que ser rechazado. Luego deshaz ese commit local (`git reset --hard origin/main`).

## Etapa 6. Labels y milestones

1. Borra las labels por defecto y crea:
   - `tipo:historia`, `tipo:tarea`, `tipo:defecto`, `tipo:cambio`, `tipo:incidente`
   - `epica:gestion-despacho`, `epica:convenios`, `epica:operacion-ruta`, `epica:modulo-pasajero`, `epica:aeropuerto`
   - `prioridad:alta`, `prioridad:media`, `prioridad:baja`
   - `area:backend`, `area:web`, `area:app`, `area:infra`, `area:docs`
   - `pareja` (HU que se trabajan entre los dos)
   - Usa colores distintos por grupo.
2. Milestones `Sprint 0`, `Sprint 1`, `Sprint 2`, `Sprint 3`, `Sprint 4`, **sin fecha** (las fechas se re-planifican aparte). Descripción de cada uno según el objetivo del sprint del informe:
   - S1: Base del sistema: modelo de datos, autenticación, flota, reservas, portal con verificación por WhatsApp y registro de vuelo.
   - S2: Tiempo real y ciclo completo del conductor: mapa, asignación con 60 s, estados del viaje, cobro y avisos al pasajero.
   - S3: Despacho asistido y aeropuerto: sugerencia por distancia y turno, fila virtual, monitoreo de vuelos y convenios.
   - S4: Control y cierre: reportes, auditoría, acceso de convenios, chat del panel, cierre forzado y panel de indicadores.

## Etapa 7. Tablero (GitHub Projects)

1. Proyecto de la organización «FlotaÁgil — Backlog», vinculado al repo.
2. Campo `Status` con opciones: `Backlog`, `Sprint Backlog`, `En curso`, `En revisión`, `Hecho` (usa GraphQL `updateProjectV2Field` si hace falta).
3. Campos nuevos: `Sprint` (selección: Sprint 0–4), `SP` (número), `Responsable` (selección: Renato, Carlos, Pareja), `Épica` (selección con las 5 épicas), `Prioridad` (Alta, Media, Baja).
4. Las vistas no se pueden crear por API: al final dime cómo crear en el navegador la vista Tablero (agrupada por Status) y la vista Tabla agrupada por Sprint con suma de SP.

## Etapa 8. Issues del backlog

Desde `docs/backlog/backlog.json`:
1. Un issue por HU. Título: `HU-03 · Ingresar, editar y cancelar reservas`. Cuerpo con: historia, criterios de aceptación (como lista de verificación), SP, prioridad, reglas de negocio, casos de prueba, dependencias, estado del cambio respecto del Informe 1.
2. Labels: `tipo:historia`, la de épica, la de prioridad, `area:*` según corresponda (si no es obvio, pregúntame) y `pareja` en HU-02 y HU-29.
3. Milestone según el sprint. Asigna a `renatogonzalez08-source` las de Renato; las de Carlos quedan sin asignar con «Responsable: Carlos» en el cuerpo.
4. Issue de tarea para H-3 (PoC de GPS) en Sprint 1, con `tipo:tarea`, `area:app`, asignado a Renato.
5. Issue «Sprint 0: ecosistema GitHub» con `tipo:tarea`, milestone Sprint 0, con el checklist de este archivo; ciérralo al final.
6. Agrega todos al proyecto con sus campos (Sprint, SP, Responsable, Épica, Prioridad) y Status `Backlog`; las de Sprint 1 en `Sprint Backlog`.
7. Después de crearlas, agrega en el cuerpo de cada issue las dependencias como enlaces a los números de issue reales.

## Etapa 9. Verificación final

Muéstrame:
- Total de issues por milestone y suma de SP por sprint (debe dar S1 45, S2 45, S3 42, S4 46; total 178) y SP por responsable (Renato 89, Carlos 89).
- Ruleset activo y prueba de push rechazado.
- Estado de secret scanning, push protection y Dependabot.
- Último run de CI en verde.
- Lo que queda pendiente para hacer en el navegador.

No crees código de Django ni de React en este sprint.
