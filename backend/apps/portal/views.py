"""Portal público del pasajero (HU-19). Sin autenticación: se protege con throttling por IP,
límite por teléfono y un campo trampa."""

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.cuentas.models import Empresa

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


class SolicitudPortalView(_VistaPortal):
    throttle_classes = [PortalPorMinuto, PortalPorHora]

    @extend_schema(
        tags=["portal"],
        summary="Solicitar un viaje sin cuenta",
        request=SolicitudSerializer,
        responses={
            201: SolicitudRespuestaSerializer,
            404: OpenApiResponse(description="Empresa inexistente o inactiva"),
            429: OpenApiResponse(description="Demasiadas solicitudes desde la IP o con el mismo teléfono"),
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
