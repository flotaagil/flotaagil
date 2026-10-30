# web/

Interfaz web de FlotaÁgil.

**Responsable:** Renato González.

- **Panel** (administrador y despachador): reservas, mapa en tiempo real, asignación, convenios, reportes, auditoría, chat de WhatsApp.
- **Portal** (pasajero sin cuenta y supervisor de convenio): formulario de solicitud y acceso por link protegido.

Stack: Node 22 LTS, TypeScript 5, React 19 + Vite 6, React Router 7, TanStack Query 5, React Hook Form + Zod, CSS Modules, openapi-fetch con tipos generados desde `backend/openapi.yaml`. Pruebas con Vitest + Testing Library; ESLint.

Hoy tiene la infraestructura compartida (cliente de la API, sesión, login, layout) y las pantallas de reservas de HU-03: listado con filtros, detalle con historial, crear, editar y cancelar. El formulario público llega en `feat/HU-19-web`.

## Desarrollo

Requisitos: Node 22 (`.nvmrc`) y el backend levantado (`backend/README.md`), con `PANEL_ORIGENES` que incluya `http://localhost:5173`.

```
cd web
npm ci
npm run dev          # http://localhost:5173 ; /api → http://localhost:8000 (proxy de Vite)
```

| Script | Qué hace |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest con cobertura; exige ≥ 70 % en `src/sesion`, `src/api`, `src/hora` y `src/reservas` (configurado en `vite.config.ts`, así que también aplica a `npx vitest run` del CI) |
| `npm run build` | Typecheck, build de producción en `dist/` y `scripts/verificar-carga.mjs` (carga diferida, ver abajo) |
| `npm run gen:api` | Regenera `src/api/esquema.d.ts` desde `../backend/openapi.yaml`. Se versiona: después de regenerar no debe haber diferencias |

Se versiona `package-lock.json` y se instala con `npm ci`. No se usan `--force` ni `--legacy-peer-deps`.

Para **cambiar dependencias** (`npm install <paquete>`), npm 10 (el que trae Node 22) falla con `Cannot read properties of null (reading 'edgesOut')` al resolver las peers opcionales de Vitest 4. Se usa npm 11 solo para esa operación: `npx npm@11.21.1 install …`. El lockfile resultante (v3) se instala sin problemas con el `npm ci` de npm 10.

## Estructura

```
src/api/        cliente tipado (openapi-fetch), llamadas de auth, mensajes de error por código
src/sesion/     sesión: access en memoria, renovación, logout, marca de logout pendiente
src/hora/       horas en America/Santiago (conversión y formato), compartido por panel y portal
src/reservas/   HU-03: llamadas y caché, filtros, formulario, errores, pantallas
src/rutas/      tabla de rutas (router, menú, guarda por rol y validación de `volver`)
src/componentes/ layout y piezas comunes (sin conexión, error de carga)
src/paginas/    login, inicio, sin permiso, no encontrada
src/estilos/    tokens (colores, espacios, modo oscuro) y estilos globales
src/pruebas/    servidores falsos (auth y reservas) y piezas falsas del navegador para Vitest
scripts/        verificar-carga.mjs (se ejecuta al final del build)
```

## Sesión

- El **access** vive solo en memoria. El **refresh** está en la cookie httpOnly `refresh_panel` (`Path=/api/auth/`), que maneja el navegador.
- **Refresh silencioso** al abrir las rutas del panel y `/login`: mientras dura se muestra «Cargando…», nunca el formulario. Las rutas públicas no lo hacen.
- **Arranque sin servidor**: si el refresh (o `/api/auth/yo/`) falla por red o responde 502, 503 o 504, en vez del login se muestra «No se pudo conectar con el servidor»; con un 500 (u otro error del backend), «El servidor tuvo un error». Ambos con **Reintentar**, y se reintenta solo una vez al volver la conexión (`online`); no hay reintentos periódicos. La URL se conserva. Con la marca de logout pendiente no hay refresh: se muestra el login con su aviso.
- **Ante un 401** el cliente de la API renueva con una operación compartida por pestaña y repite la petición **una vez**. Las rutas `/api/auth/` no se reintentan.
- **Entre pestañas** el refresh rota y deja el anterior en la lista negra, y la cookie es una sola:
  - con **Web Locks** (`isSecureContext && navigator.locks`: HTTPS o localhost) las renovaciones van en serie y ninguna recibe 401;
  - sin Web Locks (p. ej. probando desde el celular por `http://192.168…`), **plan B de mejor esfuerzo**: ante un 401 se espera entre 300 y 600 ms al azar y se reintenta una vez. Si la cookie todavía no se actualizó, la pestaña queda anónima, sin más reintentos; al recargarla, entra con la cookie que dejó la otra.
- `sesion_invalida` y `sesion_expirada` se tratan igual: se limpia la sesión y se vuelve a `/login` con «Tu sesión terminó». No se depende de recibir `sesion_expirada`.
- Las peticiones de auth van en JSON. No se configura `Referrer-Policy: no-referrer` (el backend usa el Referer como respaldo de Origin).

### Logout

- Toma el mismo Web Lock que la renovación y avisa a las otras pestañas por BroadcastChannel.
- La sesión local se limpia de inmediato. Si el servidor confirma con **204**, la sesión queda cerrada.
- Si no hay confirmación (falla de red, respuesta perdida o cualquier respuesta distinta de 204, como el 502/500 del proxy con el backend caído), se guarda la marca `flotaagil.logout_pendiente` en localStorage y se informa «No se pudo confirmar el cierre de sesión en el servidor». Mientras exista la marca, **ninguna pestaña hace refresh** y el logout se reintenta al cargar y al volver la conexión; la marca se borra con el 204. El backend responde 204 aunque la cookie falte, esté vencida o ya invalidada, así que el reintento es seguro.
- **Sin localStorage** (bloqueado por el navegador o en modo privado restrictivo), la marca queda en memoria de la pestaña y se comparte por BroadcastChannel con las pestañas abiertas. **No se garantiza que sobreviva a una recarga**: al recargar, la pestaña no sabe que había un logout pendiente.
- Un login nuevo con la marca intenta antes el logout pendiente y luego la borra (el login reemplaza la cookie).

### `volver`

Después del login se vuelve a `?volver=` solo si, resuelto con `new URL(volver, location.origin)`, tiene el mismo origen y su ruta existe en la tabla de React Router (`matchRoutes`). Se usa solo pathname + search + hash; si no cumple, se va a Inicio.

### Rutas y roles

La tabla `src/rutas/tabla.tsx` define las pantallas con su título, si van al menú y los roles que pueden verlas. De ahí salen el router, el menú y la guarda por rol. **La guarda es solo UX**: la seguridad real la pone el backend (401/403 y aislamiento por empresa).

### Carga diferida

Todas las pantallas se cargan con `lazy`; el paquete inicial lleva solo el router, la sesión y el marco. Si un chunk no se puede descargar (p. ej. tras un despliegue), se muestra «Hay una versión nueva del panel» con Recargar. `npm run build` termina con `scripts/verificar-carga.mjs`, que lee `dist/.vite/modulos.json` (lo escribe un plugin de `vite.config.ts`) y falla si una pantalla no es lazy o si el paquete inicial o una ruta pública (login, no encontrada) cargan, por imports estáticos, algún módulo de `src/reservas/`.

## Horas (America/Santiago)

Las horas se ingresan y se muestran en hora de Santiago, sin depender de la zona del navegador ni suponer un desfase fijo (`src/hora/`):

- **De pared a instante**: la hora escrita (`datetime-local`) se lee como si fuera UTC, se le restan los desfases vigentes un día antes y un día después, y se quedan los candidatos que, de vuelta a hora de Santiago (`Intl.DateTimeFormat` con `timeZone`), dan la misma hora. A la API va siempre el instante en UTC (`toISOString()`).
- **Hora inexistente** (salto de septiembre, p. ej. 00:00 a 00:59 del 06-09-2026): se rechaza con un mensaje que indica el tramo y la primera hora válida.
- **Hora repetida** (vuelta de abril, p. ej. 23:00 a 23:59 del 04-04-2026): por defecto la primera ocurrencia (UTC−3), con un aviso y el selector «primera (UTC−3) / segunda (UTC−4)». Al mostrar una hora repetida se agrega su desfase. Al editar, el valor inicial conserva cuál ocurrencia era, y la hora solo se envía si se cambió.
- Los datos de zona son los del navegador: si Chile cambia sus reglas, un navegador desactualizado puede diferir del backend.
- ESLint prohíbe fuera de `src/hora/` los métodos de `Date` que dependen de la zona del navegador (`getHours`, `getTimezoneOffset`, `toLocaleString`…).

## Reservas (HU-03)

- **Listado**: filtros del backend (estado repetible, día, desde/hasta, sentido, canal, búsqueda, orden) guardados en la URL, así sobreviven a F5 y se pueden compartir. `desde` y `hasta` van en la URL como hora de Santiago. Vista por defecto: «desde hoy 00:00» (hoy en Santiago), visible y removible; al quitarla la URL queda con `desde=`. Una fecha o un `hasta` la reemplazan. Paginación de 25.
- **Crear**: canal Teléfono o WhatsApp (convenio llega con su HU); el vuelo solo con «Desde el aeropuerto». Teléfono: un valor de 9 dígitos que empieza con 9 (separadores aparte) se completa a `+569XXXXXXXX` en el mismo campo, a la vista, antes de validar; cualquier otro valor se exige en E.164. Tarifa fuera de HU-03.
- **Editar**: solo en estados editables (pendiente de confirmación, solicitado); se envían solo los campos modificados (así no se pisa el vuelo ni su ETA). Pasajero, teléfono y canal en solo lectura: el PATCH no los acepta (PR-03). Un 409 bloquea el formulario y muestra el estado real.
- **Cancelar**: motivo obligatorio (hasta 200 caracteres) en un diálogo que es la confirmación.
- Los 400 del backend se muestran en cada campo; si la creación falla sin respuesta, se avisa que no se sabe si quedó creada.
- **Caché** (TanStack Query): `['viajes', 'lista', consulta]` y `['viajes', 'detalle', id]`. Crear, editar y cancelar dejan el detalle nuevo en la caché e invalidan los listados; un 409 invalida el detalle y los listados.

## Producción (solo documentado)

El panel se sirve desde el mismo origen que la API, con Nginx:

```nginx
location / {
    root /srv/flotaagil/web;          # contenido de web/dist
    try_files $uri /index.html;       # rutas de la SPA
}
location /api/ {
    proxy_pass http://backend:8000;   # ver backend/README.md, «Producción detrás de Nginx»
}
```

`PANEL_ORIGENES` del backend debe tener el origen https público (p. ej. `https://panel.flotaagil.example`). Nginx no debe reescribir `Origin` ni `Referer`.
