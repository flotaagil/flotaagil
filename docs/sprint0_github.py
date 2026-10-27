"""Sprint 0, etapas 6 a 8: labels, milestones, tablero e issues del backlog de FlotaÁgil.

Idempotente: lo que ya existe no se duplica, los issues existentes no se reescriben
(salvo el bloque de dependencias) y los campos del tablero que ya tienen valor no se tocan.

Uso, desde la raíz del repositorio:
    python docs/sprint0_github.py --dry-run    muestra los cambios sin aplicarlos
    python docs/sprint0_github.py              aplica los cambios

Requiere gh autenticado con los scopes repo y project.
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

ORG = "flotaagil"
REPO_NOMBRE = "flotaagil"
REPO = f"{ORG}/{REPO_NOMBRE}"
PROYECTO = "FlotaÁgil — Backlog"
RENATO = "renatogonzalez08-source"
BACKLOG = Path("docs/backlog/backlog.json")
TITULO_SPRINT0 = "Sprint 0: ecosistema GitHub"

LABELS_POR_DEFECTO = {
    "bug", "documentation", "duplicate", "enhancement", "good first issue",
    "help wanted", "invalid", "question", "wontfix",
}

LABELS = {
    "tipo:historia": ("5319e7", "Historia de usuario del backlog"),
    "tipo:tarea": ("5319e7", "Tarea técnica o de proyecto"),
    "tipo:defecto": ("5319e7", "Error encontrado en pruebas o en uso"),
    "tipo:cambio": ("5319e7", "Solicitud de cambio (RFC, Anexo J)"),
    "tipo:incidente": ("5319e7", "Incidente en operación"),
    "epica:gestion-despacho": ("1d76db", "Épica Gestión y despacho"),
    "epica:convenios": ("1d76db", "Épica Convenios"),
    "epica:operacion-ruta": ("1d76db", "Épica Operación en ruta"),
    "epica:modulo-pasajero": ("1d76db", "Épica Módulo pasajero"),
    "epica:aeropuerto": ("1d76db", "Épica Aeropuerto"),
    "prioridad:alta": ("b60205", "Prioridad alta"),
    "prioridad:media": ("e99695", "Prioridad media"),
    "prioridad:baja": ("f9d0c4", "Prioridad baja"),
    "area:backend": ("0e8a16", "Django, API, WebSocket, Celery"),
    "area:web": ("0e8a16", "Panel y portal (React + Vite)"),
    "area:app": ("0e8a16", "App del conductor (Capacitor)"),
    "area:infra": ("0e8a16", "Docker, Nginx, AWS"),
    "area:docs": ("0e8a16", "Documentación"),
    "pareja": ("fbca04", "HU trabajada entre los dos integrantes"),
}

MILESTONES = {
    "Sprint 0": "Ecosistema GitHub: organización, repositorio, CI, ruleset, plantillas, tablero y backlog.",
    "Sprint 1": "Base del sistema: modelo de datos, autenticación, flota, reservas, portal con verificación por WhatsApp y registro de vuelo.",
    "Sprint 2": "Tiempo real y ciclo completo del conductor: mapa, asignación con 60 s, estados del viaje, cobro y avisos al pasajero.",
    "Sprint 3": "Despacho asistido y aeropuerto: sugerencia por distancia y turno, fila virtual, monitoreo de vuelos y convenios.",
    "Sprint 4": "Control y cierre: reportes, auditoría, acceso de convenios, chat del panel, cierre forzado y panel de indicadores.",
}

# Áreas que toca cada HU (la primera es la principal).
AREAS = {
    "HU-01": ["web", "backend"],
    "HU-02": ["web", "app", "backend"],
    "HU-03": ["backend", "web"],
    "HU-04": ["backend", "web"],
    "HU-05": ["backend", "web"],
    "HU-06": ["backend", "web"],
    "HU-10": ["backend", "web"],
    "HU-11": ["web", "backend"],
    "HU-12": ["backend", "web"],
    "HU-13": ["app", "backend"],
    "HU-14": ["app", "backend"],
    "HU-15": ["backend", "app"],
    "HU-16": ["app", "backend"],
    "HU-17": ["app"],
    "HU-18": ["app", "backend"],
    "HU-19": ["web", "backend"],
    "HU-20": ["backend"],
    "HU-21": ["backend"],
    "HU-24": ["backend"],
    "HU-25": ["web", "backend"],
    "HU-26": ["backend", "web"],
    "HU-27": ["backend", "web"],
    "HU-28": ["web", "backend"],
    "HU-29": ["backend", "app", "web"],
    "HU-30": ["backend", "web"],
}

PRIORIDAD_TAREAS = {"H-3": "Alta"}

ESTADOS = [
    ("Backlog", "GRAY"),
    ("Sprint Backlog", "BLUE"),
    ("En curso", "YELLOW"),
    ("En revisión", "PURPLE"),
    ("Hecho", "GREEN"),
]

CAMPOS_SELECCION = {
    "Sprint": ["Sprint 0", "Sprint 1", "Sprint 2", "Sprint 3", "Sprint 4"],
    "Responsable": ["Renato", "Carlos", "Pareja"],
    "Épica": ["Gestión y despacho", "Convenios", "Operación en ruta", "Módulo pasajero", "Aeropuerto"],
    "Prioridad": ["Alta", "Media", "Baja"],
}

CUERPO_SPRINT0 = """Configuración del ecosistema GitHub según `docs/sprint0.md`.

- [x] Etapa 1. Permisos de `gh` (repo, workflow, admin:org, project)
- [x] Etapa 2. Configuración de la organización (permiso base read, sin creación de repos, descripción)
- [ ] Etapa 2. Exigir 2FA en la organización (navegador)
- [x] Etapa 3. Contenido inicial: README, .gitignore, .gitattributes, .editorconfig, READMEs por área, plantillas, CODEOWNERS, Dependabot, CI
- [x] Etapa 4. Repositorio público, solo squash, topics, secret scanning, push protection, Dependabot y reporte privado de vulnerabilidades
- [x] Etapa 5. Ruleset «Proteger main» activo y push directo rechazado
- [ ] Etapa 6. Labels y milestones
- [ ] Etapa 7. Tablero «FlotaÁgil — Backlog» con campos
- [ ] Etapa 7. Vistas Tablero y Tabla por Sprint (navegador)
- [ ] Etapa 8. Issues del backlog (25 HU + H-3) en el tablero
- [ ] Etapa 9. Verificación final
"""

INICIO_DEPS = "<!-- dependencias -->"
FIN_DEPS = "<!-- /dependencias -->"

simulacion = False


# ---------- Acceso a GitHub ----------

def gh(*args, entrada=None):
    r = subprocess.run(["gh", *args], input=entrada, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        sys.exit(f"\nError en «gh {' '.join(args[:4])}»:\n{r.stderr.strip()}")
    return json.loads(r.stdout) if r.stdout.strip() else None


def api(metodo, ruta, datos=None):
    if datos is None:
        return gh("api", "-X", metodo, ruta)
    return gh("api", "-X", metodo, ruta, "--input", "-", entrada=json.dumps(datos))


def listar(ruta):
    paginas = gh("api", "--paginate", "--slurp", ruta)
    return [x for pagina in paginas for x in pagina]


def graphql(query, **variables):
    r = gh("api", "graphql", "--input", "-", entrada=json.dumps({"query": query, "variables": variables}))
    if r.get("errors"):
        sys.exit(f"\nError GraphQL: {json.dumps(r['errors'], ensure_ascii=False)}")
    return r["data"]


def cambio(texto, accion):
    """Aplica un cambio en GitHub, o solo lo anuncia en modo simulación."""
    print(("  [simulación] " if simulacion else "  ") + texto)
    return None if simulacion else accion()


# ---------- Etapa 6: labels y milestones ----------

def etapa_labels():
    print("\nLabels")
    existentes = {l["name"]: l for l in listar(f"repos/{REPO}/labels?per_page=100")}
    for nombre in sorted(LABELS_POR_DEFECTO & existentes.keys()):
        cambio(f"borrar {nombre}", lambda n=nombre: api("DELETE", f"repos/{REPO}/labels/{quote(n, safe='')}"))
    for nombre, (color, descripcion) in LABELS.items():
        actual = existentes.get(nombre)
        datos = {"name": nombre, "color": color, "description": descripcion}
        if actual is None:
            cambio(f"crear {nombre}", lambda d=datos: api("POST", f"repos/{REPO}/labels", d))
        elif actual["color"].lower() != color or (actual.get("description") or "") != descripcion:
            cambio(f"actualizar {nombre}",
                   lambda n=nombre, d=datos: api("PATCH", f"repos/{REPO}/labels/{quote(n, safe='')}", d))


def etapa_milestones():
    print("\nMilestones")
    existentes = {m["title"]: m for m in listar(f"repos/{REPO}/milestones?state=all&per_page=100")}
    numeros = {}
    for titulo, descripcion in MILESTONES.items():
        actual = existentes.get(titulo)
        if actual is None:
            nuevo = cambio(f"crear {titulo}",
                           lambda t=titulo, d=descripcion: api("POST", f"repos/{REPO}/milestones",
                                                               {"title": t, "description": d}))
            numeros[titulo] = nuevo["number"] if nuevo else None
        else:
            numeros[titulo] = actual["number"]
            if (actual.get("description") or "") != descripcion:
                cambio(f"actualizar descripción de {titulo}",
                       lambda n=actual["number"], d=descripcion: api("PATCH", f"repos/{REPO}/milestones/{n}",
                                                                     {"description": d}))
    return numeros


# ---------- Etapa 7: tablero ----------

CONSULTA_CAMPOS = """
query($o: String!, $n: Int!) {
  organization(login: $o) {
    projectV2(number: $n) {
      fields(first: 50) {
        nodes {
          ... on ProjectV2FieldCommon { id name dataType }
          ... on ProjectV2SingleSelectField { options { id name } }
        }
      }
    }
  }
}"""


def leer_campos(numero):
    nodos = graphql(CONSULTA_CAMPOS, o=ORG, n=numero)["organization"]["projectV2"]["fields"]["nodes"]
    return {c["name"]: c for c in nodos if c}


def opciones(nombres, colores=None):
    return [{"name": n, "color": (colores or {}).get(n, "GRAY"), "description": ""} for n in nombres]


def etapa_tablero():
    print("\nTablero")
    datos = graphql("""
        query($o: String!, $r: String!) {
          organization(login: $o) { id projectsV2(first: 100) { nodes { id number title } } }
          repository(owner: $o, name: $r) { id }
        }""", o=ORG, r=REPO_NOMBRE)
    org_id = datos["organization"]["id"]
    repo_id = datos["repository"]["id"]
    proyecto = next((p for p in datos["organization"]["projectsV2"]["nodes"] if p["title"] == PROYECTO), None)
    if proyecto is None:
        creado = cambio(f"crear proyecto «{PROYECTO}»", lambda: graphql("""
            mutation($o: ID!, $t: String!) {
              createProjectV2(input: {ownerId: $o, title: $t}) { projectV2 { id number title } }
            }""", o=org_id, t=PROYECTO))
        if creado is None:
            print("  (simulación: el proyecto no existe todavía; se omiten campos e items)")
            return None
        proyecto = creado["createProjectV2"]["projectV2"]
    pid, numero = proyecto["id"], proyecto["number"]
    print(f"  proyecto #{numero}: https://github.com/orgs/{ORG}/projects/{numero}")

    vinculados = graphql("""
        query($o: String!, $n: Int!) {
          organization(login: $o) { projectV2(number: $n) { repositories(first: 20) { nodes { nameWithOwner } } } }
        }""", o=ORG, n=numero)["organization"]["projectV2"]["repositories"]["nodes"]
    if REPO not in [r["nameWithOwner"] for r in vinculados]:
        cambio(f"vincular el proyecto a {REPO}", lambda: graphql("""
            mutation($p: ID!, $r: ID!) {
              linkProjectV2ToRepository(input: {projectId: $p, repositoryId: $r}) { clientMutationId }
            }""", p=pid, r=repo_id))

    campos = leer_campos(numero)
    estado = campos["Status"]
    nombres_estado = [n for n, _ in ESTADOS]
    if [o["name"] for o in estado["options"]] != nombres_estado:
        cambio(f"opciones de Status: {', '.join(nombres_estado)}", lambda: graphql("""
            mutation($f: ID!, $o: [ProjectV2SingleSelectFieldOptionInput!]) {
              updateProjectV2Field(input: {fieldId: $f, singleSelectOptions: $o}) { clientMutationId }
            }""", f=estado["id"], o=opciones(nombres_estado, dict(ESTADOS))))

    for nombre, valores in CAMPOS_SELECCION.items():
        if nombre not in campos:
            cambio(f"crear campo {nombre} ({', '.join(valores)})", lambda n=nombre, v=valores: graphql("""
                mutation($p: ID!, $n: String!, $o: [ProjectV2SingleSelectFieldOptionInput!]) {
                  createProjectV2Field(input: {projectId: $p, dataType: SINGLE_SELECT, name: $n,
                                               singleSelectOptions: $o}) { clientMutationId }
                }""", p=pid, n=n, o=opciones(v)))
        else:
            faltan = set(valores) - {o["name"] for o in campos[nombre]["options"]}
            if faltan:
                print(f"  AVISO: al campo {nombre} le faltan opciones {sorted(faltan)}; agrégalas a mano")
    if "SP" not in campos:
        cambio("crear campo SP (número)", lambda: graphql("""
            mutation($p: ID!) {
              createProjectV2Field(input: {projectId: $p, dataType: NUMBER, name: "SP"}) { clientMutationId }
            }""", p=pid))

    if simulacion:
        return {"id": pid, "numero": numero, "campos": campos}
    return {"id": pid, "numero": numero, "campos": leer_campos(numero)}


# ---------- Etapa 8: issues ----------

def criterios(texto):
    """Separa los criterios en frases por «.» o «;» fuera de paréntesis."""
    partes, actual, nivel = [], "", 0
    for i, c in enumerate(texto):
        nivel += (c == "(") - (c == ")")
        if nivel == 0 and c in ".;" and texto[i + 1:i + 2] in (" ", ""):
            partes.append(actual)
            actual = ""
        else:
            actual += c
    partes.append(actual)
    return [p.strip()[0].upper() + p.strip()[1:] for p in partes if p.strip()]


def bloque_dependencias(ids, numeros):
    if not ids:
        contenido = "Ninguna."
    else:
        contenido = "\n".join(f"- #{numeros[i]} ({i})" if numeros.get(i) else f"- {i}" for i in ids)
    return f"{INICIO_DEPS}\n{contenido}\n{FIN_DEPS}"


def cuerpo_hu(h, numeros):
    responsable = h["responsable"]
    if h["en_pareja"]:
        otro = "Carlos" if responsable == "Renato" else "Renato"
        responsable += f" (en pareja con {otro})"
    return "\n".join([
        f"**Historia:** {h['historia']}",
        "",
        "## Criterios de aceptación",
        "",
        *[f"- [ ] {c}" for c in criterios(h["criterios"])],
        "",
        "## Detalle",
        "",
        "| Campo | Valor |",
        "|---|---|",
        f"| Épica | {h['epica']} |",
        f"| Story points | {h['sp']} |",
        f"| Prioridad | {h['prioridad']} |",
        f"| Sprint | {h['sprint']} |",
        f"| Responsable | {responsable} |",
        f"| Reglas de negocio | {', '.join(h['reglas']) or '—'} |",
        f"| Casos de prueba | {', '.join(h['casos_prueba']) or '—'} |",
        f"| Cambio respecto del Informe 1 | {h['estado_cambio']} |",
        "",
        "## Dependencias",
        "",
        bloque_dependencias(h["depende_de"], numeros),
        "",
        "_Fuente: `docs/backlog/backlog.json`._",
        "",
    ])


def cuerpo_tarea(t, prioridad):
    return "\n".join([
        t["descripcion"],
        "",
        "| Campo | Valor |",
        "|---|---|",
        f"| Sprint | {t['sprint']} |",
        f"| Responsable | {t['responsable']} |",
        f"| Prioridad | {prioridad or '—'} |",
        "",
        "_Fuente: `docs/backlog/backlog.json`._",
        "",
    ])


def definir_issues(backlog, milestones):
    """Lista de issues a crear, con labels, milestone, asignado y valores del tablero."""
    issues = [{
        "clave": TITULO_SPRINT0,
        "titulo": TITULO_SPRINT0,
        "cuerpo": CUERPO_SPRINT0,
        "labels": ["tipo:tarea"],
        "milestone": milestones.get("Sprint 0"),
        "asignados": [RENATO],
        "campos": {"Sprint": "Sprint 0", "Responsable": "Renato", "Status": "En curso"},
        "depende_de": [],
    }]
    for t in backlog["tareas"]:
        # H-3 no trae prioridad en el backlog; se fija Alta por ser el riesgo R-01 (decisión del Sprint 0).
        prioridad = PRIORIDAD_TAREAS.get(t["id"])
        labels = ["tipo:tarea", "area:app"] + ([f"prioridad:{prioridad.lower()}"] if prioridad else [])
        campos = {
            "Sprint": t["sprint"],
            "Responsable": t["responsable"],
            "Status": "Sprint Backlog" if t["sprint"] == "Sprint 1" else "Backlog",
        }
        if prioridad:
            campos["Prioridad"] = prioridad
        issues.append({
            "clave": t["id"],
            "titulo": f"{t['id']} · {t['titulo']}",
            "cuerpo": cuerpo_tarea(t, prioridad),
            "labels": labels,
            "milestone": milestones.get(t["sprint"]),
            "asignados": [RENATO] if t["responsable"] == "Renato" else [],
            "campos": campos,
            "depende_de": [],
        })
    for h in backlog["historias"]:
        labels = ["tipo:historia", h["label_epica"], f"prioridad:{h['prioridad'].lower()}"]
        labels += [f"area:{a}" for a in AREAS[h["id"]]]
        if h["en_pareja"]:
            labels.append("pareja")
        issues.append({
            "clave": h["id"],
            "titulo": f"{h['id']} · {h['titulo']}",
            "cuerpo": cuerpo_hu(h, {}),
            "labels": labels,
            "milestone": milestones.get(h["sprint"]),
            "asignados": [RENATO] if h["responsable"] == "Renato" else [],
            "campos": {
                "Sprint": h["sprint"],
                "SP": h["sp"],
                "Responsable": "Pareja" if h["en_pareja"] else h["responsable"],
                "Épica": h["epica"],
                "Prioridad": h["prioridad"],
                "Status": "Sprint Backlog" if h["sprint"] == "Sprint 1" else "Backlog",
            },
            "depende_de": h["depende_de"],
        })
    return issues


def buscar_existente(issue, existentes):
    if issue["clave"] == TITULO_SPRINT0:
        return next((e for e in existentes if e["title"] == TITULO_SPRINT0), None)
    return next((e for e in existentes if e["title"].startswith(f"{issue['clave']} ·")), None)


def etapa_issues(backlog, milestones):
    print("\nIssues")
    existentes = [i for i in listar(f"repos/{REPO}/issues?state=all&per_page=100") if "pull_request" not in i]
    issues = definir_issues(backlog, milestones)
    for issue in issues:
        actual = buscar_existente(issue, existentes)
        if actual is None:
            datos = {"title": issue["titulo"], "body": issue["cuerpo"], "labels": issue["labels"],
                     "milestone": issue["milestone"], "assignees": issue["asignados"]}
            actual = cambio(f"crear «{issue['titulo']}»", lambda d=datos: api("POST", f"repos/{REPO}/issues", d))
        else:
            print(f"  ya existe #{actual['number']} {actual['title']}")
        issue["github"] = actual

    print("\nDependencias")
    numeros = {i["clave"]: i["github"]["number"] for i in issues if i["github"]}
    for issue in issues:
        if not issue["depende_de"] or not issue["github"]:
            continue
        cuerpo = issue["github"]["body"] or ""
        nuevo = re.sub(re.escape(INICIO_DEPS) + r".*?" + re.escape(FIN_DEPS),
                       lambda _: bloque_dependencias(issue["depende_de"], numeros), cuerpo, flags=re.S)
        if nuevo != cuerpo:
            numero = issue["github"]["number"]
            cambio(f"enlazar dependencias de #{numero} ({', '.join(issue['depende_de'])})",
                   lambda n=numero, b=nuevo: api("PATCH", f"repos/{REPO}/issues/{n}", {"body": b}))
    return issues


# ---------- Etapa 8: issues en el tablero ----------

CONSULTA_VALORES = """
query($i: ID!) {
  node(id: $i) {
    ... on ProjectV2Item {
      fieldValues(first: 30) {
        nodes {
          ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }
          ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2FieldCommon { name } } }
        }
      }
    }
  }
}"""


def etapa_items(tablero, issues):
    print("\nIssues en el tablero")
    if tablero is None or simulacion:
        print("  (simulación: se agregarían todos los issues con sus campos; los ya llenos no se tocan)")
        return
    campos = tablero["campos"]
    for issue in issues:
        item = graphql("""
            mutation($p: ID!, $c: ID!) {
              addProjectV2ItemById(input: {projectId: $p, contentId: $c}) { item { id } }
            }""", p=tablero["id"], c=issue["github"]["node_id"])["addProjectV2ItemById"]["item"]["id"]
        nodos = graphql(CONSULTA_VALORES, i=item)["node"]["fieldValues"]["nodes"]
        llenos = {n["field"]["name"] for n in nodos if n and n.get("field")}
        for nombre, valor in issue["campos"].items():
            if nombre in llenos:
                continue
            campo = campos[nombre]
            if campo["dataType"] == "NUMBER":
                valor_api = {"number": float(valor)}
            else:
                opcion = next(o for o in campo["options"] if o["name"] == valor)
                valor_api = {"singleSelectOptionId": opcion["id"]}
            graphql("""
                mutation($p: ID!, $i: ID!, $f: ID!, $v: ProjectV2FieldValue!) {
                  updateProjectV2ItemFieldValue(input: {projectId: $p, itemId: $i, fieldId: $f, value: $v}) {
                    clientMutationId
                  }
                }""", p=tablero["id"], i=item, f=campo["id"], v=valor_api)
        nuevos = ", ".join(f"{k}={v}" for k, v in issue["campos"].items() if k not in llenos)
        print(f"  #{issue['github']['number']} {issue['clave']}: {nuevos or 'sin cambios'}")


def main():
    global simulacion
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="muestra los cambios sin aplicarlos")
    simulacion = parser.parse_args().dry_run
    sys.stdout.reconfigure(encoding="utf-8")

    if not BACKLOG.exists():
        sys.exit(f"No encuentro {BACKLOG}; ejecuta el script desde la raíz del repositorio.")
    backlog = json.loads(BACKLOG.read_text(encoding="utf-8"))
    print(f"Backlog: {len(backlog['historias'])} HU + {len(backlog['tareas'])} tarea(s), "
          f"{sum(h['sp'] for h in backlog['historias'])} SP"
          + ("  [MODO SIMULACIÓN: no se cambia nada]" if simulacion else ""))
    sin_area = [h["id"] for h in backlog["historias"] if h["id"] not in AREAS]
    if sin_area:
        sys.exit(f"Faltan áreas para {sin_area} en AREAS.")

    etapa_labels()
    milestones = etapa_milestones()
    tablero = etapa_tablero()
    issues = etapa_issues(backlog, milestones)
    etapa_items(tablero, issues)
    print("\nListo." if not simulacion else "\nSimulación terminada.")


if __name__ == "__main__":
    main()
