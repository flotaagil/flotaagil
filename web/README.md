# web/

Interfaz web de FlotaÁgil.

**Responsable:** Renato González.

- **Panel** (administrador y despachador): reservas, mapa en tiempo real, asignación, convenios, reportes, auditoría, chat de WhatsApp.
- **Portal** (pasajero sin cuenta y supervisor de convenio): formulario de solicitud y acceso por link protegido.

Stack: Node 22 LTS, TypeScript 5, React 19 + Vite 6, React Router 7, TanStack Query 5, React Hook Form + Zod, CSS Modules, openapi-fetch con tipos generados desde `backend/openapi.yaml`. Pruebas con Vitest + Testing Library; ESLint.

Esta base (`chore/web-base`) trae la infraestructura compartida: cliente de la API, sesión, login, layout y una página de Inicio. Las pantallas de reservas llegan en `feat/HU-03-web` y el formulario público en `feat/HU-19-web`.

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
| `npm test` | Vitest con cobertura; exige ≥ 70 % en `src/sesion` y `src/api` (configurado en `vite.config.ts`, así que también aplica a `npx vitest run` del CI) |
| `npm run build` | Typecheck y build de producción en `dist/` |
| `npm run gen:api` | Regenera `src/api/esquema.d.ts` desde `../backend/openapi.yaml`. Se versiona: después de regenerar no debe haber diferencias |

Se versiona `package-lock.json` y se instala con `npm ci`. No se usan `--force` ni `--legacy-peer-deps`.

## Estructura

```
src/api/        cliente tipado (openapi-fetch), llamadas de auth, mensajes de error por código
src/sesion/     sesión: access en memoria, renovación, logout, marca de logout pendiente
src/rutas/      tabla de rutas (router, menú, guarda por rol y validación de `volver`)
src/componentes/ layout y piezas comunes
src/paginas/    login, inicio, sin permiso, no encontrada
src/estilos/    tokens (colores, espacios, modo oscuro) y estilos globales
src/pruebas/    servidor de auth falso y piezas falsas del navegador para Vitest
```

## Sesión

- El **access** vive solo en memoria. El **refresh** está en la cookie httpOnly `refresh_panel` (`Path=/api/auth/`), que maneja el navegador.
- **Refresh silencioso** al abrir las rutas del panel y `/login`: mientras dura se muestra «Cargando…», nunca el formulario. Las rutas públicas no lo hacen.
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
