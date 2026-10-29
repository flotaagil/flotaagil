"""System checks de la configuración de seguridad.

Los de despliegue (deploy=True) solo corren con `manage.py check --deploy`; para que bloqueen el despliegue se
ejecuta `check --deploy --fail-level WARNING`. En desarrollo no muestran nada.
"""

from django.conf import settings
from django.core.checks import Error, Tags, Warning, register

from .origen import normalizar_origen


@register(Tags.security, deploy=True)
def revisar_num_proxies(app_configs, **kwargs):
    if settings.DEBUG or settings.REST_FRAMEWORK.get("NUM_PROXIES") is not None:
        return []
    return [
        Warning(
            "DJANGO_NUM_PROXIES está vacío: el throttling por IP usa el X-Forwarded-For completo, que "
            "escribe el cliente, y los límites de login y del portal se pueden saltar.",
            hint="En producción con Nginx como único proxy, DJANGO_NUM_PROXIES=1 (ver backend/README.md).",
            id="flotaagil.W001",
        )
    ]


@register(Tags.security, deploy=True)
def revisar_origenes_produccion(app_configs, **kwargs):
    if settings.DEBUG:
        return []
    if not settings.PANEL_ORIGENES:
        return [
            Warning(
                "PANEL_ORIGENES está vacío: login, refresh y logout del panel responderán 403 a todos.",
                hint="Define el origen https público del panel, p. ej. https://panel.flotaagil.example",
                id="flotaagil.W002",
            )
        ]
    inseguros = [o for o in settings.PANEL_ORIGENES if not o.strip().lower().startswith("https://")]
    if inseguros:
        return [
            Warning(
                f"PANEL_ORIGENES incluye orígenes sin https en producción: {', '.join(inseguros)}.",
                hint="En producción el panel se sirve solo por https.",
                id="flotaagil.W003",
            )
        ]
    return []


@register(Tags.security)
def revisar_formato_origenes(app_configs, **kwargs):
    malos = [o for o in settings.PANEL_ORIGENES if normalizar_origen(o) is None]
    if not malos:
        return []
    return [
        Error(
            f"PANEL_ORIGENES tiene entradas que no son un origen: {', '.join(malos)}.",
            hint="Formato esquema://host[:puerto], sin ruta, barra final ni comodines.",
            id="flotaagil.E001",
        )
    ]
