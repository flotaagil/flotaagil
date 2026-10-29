"""API de reservas (HU-03): listar con filtros, crear, ver, editar antes del despacho y cancelar con motivo.
Solo administrador y despachador, y solo viajes de su empresa (RN-13). No hay borrado."""

from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.comun.permisos import AisladoPorEmpresaMixin, con_roles
from apps.cuentas.models import Rol

from . import servicios
from .estados import actor_de
from .filtros import ViajeFiltro
from .models import EstadoViaje, Viaje
from .serializers import (
    CancelarSerializer,
    ViajeCrearSerializer,
    ViajeDetalleSerializer,
    ViajeEditarSerializer,
    ViajeSerializer,
)

CONFLICTO = OpenApiResponse(description="La reserva no admite la operación en su estado actual")


@extend_schema_view(
    list=extend_schema(summary="Listar reservas", tags=["reservas"]),
    retrieve=extend_schema(summary="Detalle de una reserva con su historial", tags=["reservas"]),
)
class ViajeViewSet(
    AisladoPorEmpresaMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Viaje.objects.select_related(
        "pasajero", "conductor__usuario", "vehiculo", "convenio", "vuelo", "empresa__configuracion"
    )
    permission_classes = [con_roles(Rol.ADMINISTRADOR, Rol.DESPACHADOR)]
    filterset_class = ViajeFiltro
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "retrieve":
            queryset = queryset.prefetch_related("historial__usuario")
        return queryset

    def get_serializer_class(self):
        return ViajeDetalleSerializer if self.action == "retrieve" else ViajeSerializer

    @extend_schema(
        summary="Ingresar una reserva",
        tags=["reservas"],
        request=ViajeCrearSerializer,
        responses={201: ViajeDetalleSerializer},
        description="Queda en SOLICITADO. El vuelo solo se acepta en viajes desde el aeropuerto.",
    )
    def create(self, request):
        entrada = ViajeCrearSerializer(data=request.data, context={"request": request})
        entrada.is_valid(raise_exception=True)
        datos = dict(entrada.validated_data)
        viaje = servicios.crear_viaje(
            empresa=request.user.empresa,
            datos=datos,
            canal=datos.pop("canal"),
            estado_inicial=EstadoViaje.SOLICITADO,
            actor=actor_de(request.user),
            usuario=request.user,
        )
        return Response(
            ViajeDetalleSerializer(self.get_queryset().get(pk=viaje.pk)).data, status=status.HTTP_201_CREATED
        )

    @extend_schema(
        summary="Editar una reserva antes del despacho",
        tags=["reservas"],
        request=ViajeEditarSerializer,
        responses={200: ViajeDetalleSerializer, 409: CONFLICTO},
    )
    def partial_update(self, request, pk=None):
        viaje = self.get_object()
        entrada = ViajeEditarSerializer(data=request.data, context={"request": request})
        entrada.is_valid(raise_exception=True)
        servicios.editar_viaje(viaje, dict(entrada.validated_data))
        return Response(ViajeDetalleSerializer(self.get_queryset().get(pk=viaje.pk)).data)

    @extend_schema(
        summary="Cancelar una reserva con motivo",
        tags=["reservas"],
        request=CancelarSerializer,
        responses={200: ViajeDetalleSerializer, 409: CONFLICTO},
    )
    @action(detail=True, methods=["post"])
    def cancelar(self, request, pk=None):
        viaje = self.get_object()
        entrada = CancelarSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        servicios.cancelar_viaje(viaje, motivo=entrada.validated_data["motivo"], usuario=request.user)
        return Response(ViajeDetalleSerializer(self.get_queryset().get(pk=viaje.pk)).data)
