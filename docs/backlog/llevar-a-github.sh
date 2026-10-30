#!/usr/bin/env bash
# Lleva a GitHub los pendientes de docs/backlog/pendientes.md y el avance de docs/backlog/backlog.json.
#
# NO se ha ejecutado: queda listo para cuando se levante la restricción de la cuenta. Es idempotente:
# - un issue se crea solo si no existe otro con el mismo título (abierto o cerrado);
# - un comentario se agrega solo si el issue no tiene ya uno con la misma marca (<!-- backlog-sprint1:… -->).
#
# Uso, desde la raíz del repo y en la rama que tenga estos archivos:
#   bash docs/backlog/llevar-a-github.sh            # muestra lo que haría, sin cambiar nada
#   bash docs/backlog/llevar-a-github.sh --aplicar  # crea los issues y los comentarios
#
# Requiere gh autenticado con permiso de escritura en flotaagil/flotaagil, y node (lee backlog.json).

set -euo pipefail

REPO="flotaagil/flotaagil"
APLICAR=false
[[ "${1:-}" == "--aplicar" ]] && APLICAR=true
BACKLOG="docs/backlog/backlog.json"

# Issues de las historias (gh issue list del 30-10-2026).
ISSUE_HU03=9
ISSUE_HU19=22
ISSUE_HU20=23
ISSUE_HU26=27

crear_issue() { # titulo etiquetas cuerpo
  local titulo="$1" etiquetas="$2" cuerpo="$3"
  local existentes
  existentes=$(gh issue list -R "$REPO" --state all --limit 500 --search "in:title \"$titulo\"" --json title \
    --jq "[.[] | select(.title == \"$titulo\")] | length")
  if [[ "$existentes" != "0" ]]; then
    echo "· ya existe: $titulo"
    return
  fi
  if $APLICAR; then
    gh issue create -R "$REPO" --title "$titulo" --label "$etiquetas" --body "$cuerpo"
  else
    echo "+ crearía: $titulo  [$etiquetas]"
  fi
}

comentar() { # numero marca cuerpo
  local numero="$1" marca="<!-- backlog-sprint1:$2 -->" cuerpo="$3"
  local ya
  ya=$(gh api "repos/$REPO/issues/$numero/comments" --paginate --jq "[.[] | select(.body | contains(\"$marca\"))] | length")
  if [[ "$ya" != "0" ]]; then
    echo "· #$numero ya tiene el comentario $2"
    return
  fi
  if $APLICAR; then
    gh issue comment "$numero" -R "$REPO" --body "$marca
$cuerpo"
  else
    echo "+ comentaría en #$numero ($2)"
  fi
}

campo() { # id campo  → valor de una historia en backlog.json
  node -e "const b=require('./$BACKLOG');process.stdout.write(String(b.historias.find(h=>h.id==='$1')['$2']??''))"
}

caso() { # id → descripción y pruebas de un caso de prueba
  node -e "const c=require('./$BACKLOG').casos_prueba.find(c=>c.id==='$1');
process.stdout.write('**'+c.id+' · '+c.titulo+'.** '+c.descripcion+'\n\nPruebas: '+c.pruebas.map(p=>'\`'+p+'\`').join(', ')+'.')"
}

rfc() { # titulo motivo elemento beneficio impacto
  cat <<EOF
### Solicitante
Renato González

### Motivo
$2

### Elemento afectado
$3

### Urgencia
Media (sugerida; la define el PO en el refinamiento)

### Beneficio esperado
$4

### Clasificación
Normal

### Análisis de impacto
$5

### Decisión
Pendiente

### Programación
Por definir en el refinamiento.

Detalle en \`docs/backlog/pendientes.md\`.
EOF
}

tarea() { # motivo propuesta rama sp
  cat <<EOF
**Motivo.** $1

**Propuesta.** $2

**Detectado en:** \`$3\`. **SP sugeridos:** $4 (estimación para el refinamiento).

Detalle en \`docs/backlog/pendientes.md\`.
EOF
}

echo "== Solicitudes de cambio"
crear_issue "RFC: PR-01 · RN-15 y AUDITORIA" "tipo:cambio,area:backend" "$(rfc "PR-01" \
  "RN-15 fija la retención de «eventos 90 días». Si AUDITORIA cuenta como evento, su purga choca con RN-12 (auditoría inmutable) y con el trigger \`auditoria_sin_cambios\`. Mientras no se decida, AUDITORIA no se purga. Detectado en \`feat/HU-03-reservas\`." \
  "RN-12, RN-15, entidad AUDITORIA" \
  "Una regla de retención sin contradicciones y una auditoría que se mantiene inmutable." \
  "- **Alcance:** decisión del PO; si se purga, procedimiento controlado con constancia.
- **Story points:** 2 (sugeridos).
- **Costo:** sin costo externo.
- **Calidad:** evita borrar evidencia de auditoría por error.
- **Riesgos:** purgar AUDITORIA sin procedimiento rompe RN-12.")"

crear_issue "RFC: PR-03 · Corregir el teléfono del pasajero al editar" "tipo:cambio,area:backend,area:web,epica:gestion-despacho" "$(rfc "PR-03" \
  "El PATCH de \`/api/viajes/{id}/\` no acepta \`pasajero\`: el panel muestra el teléfono en solo lectura. Un teléfono mal ingresado manda los avisos de WhatsApp a otra persona. Detectado en \`feat/HU-03-web\`." \
  "HU-03 (edición), API de reservas, PASAJERO" \
  "El despachador corrige un teléfono mal ingresado antes del despacho, con auditoría." \
  "- **Alcance:** PATCH con pasajero mientras la reserva sea editable; decidir si se corrige el PASAJERO o se reasigna la reserva.
- **Story points:** 3 (sugeridos).
- **Costo:** sin costo externo.
- **Calidad:** auditoría del cambio de teléfono.
- **Riesgos:** el PASAJERO se comparte por teléfono entre reservas de la empresa.")"

crear_issue "RFC: PR-05 · Portal en inglés" "tipo:cambio,area:web,area:backend,epica:modulo-pasajero" "$(rfc "PR-05" \
  "El portal está solo en español, pero muchos pasajeros que piden desde el aeropuerto son turistas. Detectado en \`feat/HU-19-web\`." \
  "HU-19 (portal), mensajes del backend, plantillas de WhatsApp (HU-20)" \
  "Turistas que no leen español pueden pedir y confirmar su viaje." \
  "- **Alcance:** nueva HU: textos del portal, mensajes de error, plantillas de WhatsApp y selector de idioma.
- **Story points:** 5 (sugeridos).
- **Costo:** plantillas de WhatsApp adicionales por aprobar en Twilio.
- **Calidad:** pruebas en ambos idiomas.
- **Riesgos:** textos legales (privacidad) también en inglés.")"

echo "== Tareas técnicas"
crear_issue "PR-02 · Logout de la app del conductor" "tipo:tarea,area:backend,area:app" "$(tarea \
  "La app no tiene logout en el servidor (\`/api/auth/app/\`): su refresh no se puede invalidar antes de que venza." \
  "Endpoint de logout de la app que deje el refresh en la lista negra, con prueba. Puede ir en la primera HU de la app." \
  "feat/HU-19-portal" 2)"

crear_issue "PR-04 · Texto del aviso de privacidad del portal" "tipo:tarea,area:web,area:docs,epica:modulo-pasajero" "$(tarea \
  "No hay un texto aprobado: el portal muestra un borrador (\`web/src/portal/Privacidad.tsx\`) con la franja «Texto provisional, pendiente de aprobación»." \
  "Reemplazar el borrador por el texto validado (responsable, datos, finalidad, encargados, plazos de RN-15, derechos y normativa) y quitar la franja." \
  "feat/HU-19-web" 1)"

crear_issue "T-01 · Clave de idempotencia en las solicitudes del portal" "tipo:tarea,area:backend,area:web,epica:modulo-pasajero" "$(tarea \
  "El POST de solicitudes del portal no es idempotente: si la respuesta se pierde, reenviar puede duplicar la reserva y el WhatsApp. Hoy solo lo acota el límite por teléfono." \
  "Encabezado \`Idempotency-Key\` generado por el formulario y guardado por un tiempo corto; un reenvío con la misma clave devuelve la respuesta original." \
  "feat/HU-19-web" 3)"

crear_issue "T-02 · Revisión de desfase del esquema OpenAPI en el CI" "tipo:tarea,area:infra" "$(tarea \
  "El CI no verifica que \`backend/openapi.yaml\` corresponda al código ni que \`web/src/api/esquema.d.ts\` corresponda a \`openapi.yaml\`." \
  "Backend: \`manage.py spectacular --file openapi.yaml --validate --fail-on-warn\` y \`git diff --exit-code openapi.yaml\`. Web: \`npm run gen:api\` y \`git diff --exit-code src/api/esquema.d.ts\`." \
  "chore/web-base" 1)"

crear_issue "T-03 · Polígono real de la Región Metropolitana" "tipo:tarea,area:backend" "$(tarea \
  "La zona de operación es un rectángulo aproximado (DC-02) que incluye zonas de regiones vecinas: un origen en Valparaíso, San Antonio o Rancagua pasa la validación «Dentro de la RM»." \
  "Polígono real de la RM como GEOCERCA (PostGIS), configurable por empresa, para validar \`VIAJE.origen_geo\`." \
  "feat/backend-base" 3)"

echo "== Comentarios en las historias"
comentar "$ISSUE_HU03" "HU-03" "**Criterios de aceptación ajustados a lo construido** (\`docs/backlog/backlog.json\`):

$(campo HU-03 criterios)

$(caso CP-05)

$(caso CP-06)"

comentar "$ISSUE_HU19" "HU-19" "**Criterios de aceptación ajustados a lo construido** (\`docs/backlog/backlog.json\`):

$(campo HU-19 criterios)

$(caso CP-07)"

comentar "$ISSUE_HU20" "HU-20" "**Avance parcial** (\`docs/backlog/backlog.json\`): $(campo HU-20 avance)"

comentar "$ISSUE_HU26" "HU-26" "**Avance parcial** (\`docs/backlog/backlog.json\`): $(campo HU-26 avance)"

$APLICAR || echo "(Sin cambios: vuelve a ejecutar con --aplicar para llevarlo a GitHub.)"
