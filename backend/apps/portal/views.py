"""Portal público del pasajero (HU-19). Sin autenticación: se protege con throttling por IP,
límite por teléfono y un campo trampa."""

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.comun.excepciones import error_con_codigo
from apps.cuentas.models import Empresa
from apps.cuentas.serializers import ErrorSerializer

from . import servicios
from .serializers import EmpresaPublicaSerializer, SolicitudRespuestaSerializer, SolicitudSerializer


class PortalPorMinuto(AnonRateThrottle):
    scope = "portal_minuto"


class PortalPorHora(AnonRateThrottle):
    scope = "portal_hora"


def _empresa(slug: str) -> Empresa:
    return get_object_or_404(Empresa.objects.select_related("configuracion"), slug=slug, activa=True)


class _VistaPortal(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get_exception_handler(self):
        # Los errores con solo `detail` llevan `code` (p. ej. limite_ip / limite_telefono en el 429).
        return error_con_codigo


class EmpresaPortalView(_VistaPortal):
    @extend_schema(
        tags=["portal"],
        summary="Datos públicos de la empresa para el formulario",
        responses={
            200: EmpresaPublicaSerializer,
            404: OpenApiResponse(description="Empresa inexistente o inactiva"),
        },
    )
    def get(self, request, slug):
        return Response(EmpresaPublicaSerializer(_empresa(slug)).data)


LIMITE = OpenApiResponse(
    response=ErrorSerializer,
    description=(
        "Demasiadas solicitudes. `code`: `limite_ip` (desde la misma IP; con el wifi del aeropuerto muchos "
        "pasajeros la comparten) o `limite_telefono` (varias solicitudes con el mismo número)."
    ),
    examples=[
        OpenApiExample(
            "Por IP",
            value={"detail": servicios.LimiteIP.default_detail, "code": "limite_ip"},
        ),
        OpenApiExample(
            "Por teléfono",
            value={"detail": servicios.LimiteTelefono.default_detail, "code": "limite_telefono"},
        ),
    ],
)


class SolicitudPortalView(_VistaPortal):
    throttle_classes = [PortalPorMinuto, PortalPorHora]

    def throttled(self, request, wait):
        raise servicios.LimiteIP(wait)

    @extend_schema(
        tags=["portal"],
        summary="Solicitar un viaje sin cuenta",
        request=SolicitudSerializer,
        responses={
            201: SolicitudRespuestaSerializer,
            404: OpenApiResponse(description="Empresa inexistente o inactiva"),
            429: LIMITE,
        },
        description=(
            "Crea la reserva en PENDIENTE_CONFIRMACION. Se confirma respondiendo el WhatsApp (HU-20) "
            "antes de `expira_en`; si no, se cancela (RN-06)."
        ),
    )
    def post(self, request, slug):
        empresa = _empresa(slug)
        entrada = SolicitudSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        _, respuesta = servicios.crear_solicitud(empresa, dict(entrada.validated_data))
        return Response(SolicitudRespuestaSerializer(respuesta).data, status=status.HTTP_201_CREATED)
