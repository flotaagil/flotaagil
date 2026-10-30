"""Errores de la API con `code` estable para que el cliente distinga los casos sin leer el texto."""

from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler


def error_con_codigo(exc, context):
    """Manejador de DRF que agrega `code` a los errores con solo `detail` (401, 403, 404, 415, 429)."""
    respuesta = exception_handler(exc, context)
    if respuesta is not None and isinstance(exc, APIException) and set(respuesta.data) == {"detail"}:
        respuesta.data["code"] = respuesta.data["detail"].code
    return respuesta
