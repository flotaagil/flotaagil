"""Protección CSRF de login, refresh y logout del panel: el navegador debe venir de PANEL_ORIGENES.

Esas vistas usan la cookie del refresh y no pasan por la protección CSRF de Django (DRF las deja exentas al
no tener autenticadores). SameSite=Lax no cubre las peticiones same-site de otro origen ni el CSRF de login,
así que se compara el encabezado Origin (o, si falta, el origen del Referer) con una lista explícita.

Nunca se compara con Host ni con X-Forwarded-*: Nginx reenvía Origin y Referer tal como los mandó el
navegador, así que el resultado no depende de la configuración del proxy. Un cliente que no es navegador
puede poner cualquier Origin, pero no tiene la cookie de la víctima: esto es anti-CSRF, no autenticación.
"""

from urllib.parse import urlsplit

from django.conf import settings
from rest_framework.permissions import BasePermission

PUERTOS_POR_DEFECTO = {"http": 80, "https": 443}


def normalizar_origen(valor: str, *, solo_origen: bool = True) -> str | None:
    """`esquema://host[:puerto]` en minúsculas y sin el puerto por defecto; None si no es un origen válido.

    Con solo_origen=False (Referer) se descartan la ruta y la consulta; con True (Origin y configuración)
    deben venir vacías.
    """
    try:
        partes = urlsplit(valor.strip())
        puerto = partes.port
    except ValueError:
        return None
    esquema = partes.scheme.lower()
    if esquema not in PUERTOS_POR_DEFECTO or not partes.hostname or partes.username or partes.password:
        return None
    if solo_origen and (partes.path or partes.query or partes.fragment):
        return None
    host = partes.hostname
    if ":" in host:  # IPv6
        host = f"[{host}]"
    if puerto is None or puerto == PUERTOS_POR_DEFECTO[esquema]:
        return f"{esquema}://{host}"
    return f"{esquema}://{host}:{puerto}"


def origen_de_la_peticion(request) -> str | None:
    """Origin si viene (aunque sea inválido: no se cae al Referer); si no, el origen del Referer."""
    origin = request.META.get("HTTP_ORIGIN")
    if origin is not None:
        return normalizar_origen(origin)
    referer = request.META.get("HTTP_REFERER")
    if referer:
        return normalizar_origen(referer, solo_origen=False)
    return None


def origenes_permitidos() -> set[str]:
    return {o for o in (normalizar_origen(v) for v in settings.PANEL_ORIGENES) if o}


class OrigenPanelPermitido(BasePermission):
    """Solo POST; responde 403 `origen_no_permitido` si el origen falta o no está en PANEL_ORIGENES."""

    message = "El origen de la petición no está permitido."
    code = "origen_no_permitido"

    def has_permission(self, request, view):
        if request.method != "POST":
            return True
        origen = origen_de_la_peticion(request)
        return origen is not None and origen in origenes_permitidos()
