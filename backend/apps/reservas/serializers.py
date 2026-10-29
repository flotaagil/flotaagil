from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.aeropuerto.models import Vuelo
from apps.comun.validadores import normalizar_telefono, validar_telefono_e164, validar_vuelo_iata
from apps.convenios.models import Convenio

from . import estados
from .models import Canal, HistorialEstado, Sentido, Viaje


class UbicacionSerializer(serializers.Serializer):
    direccion = serializers.CharField()
    lat = serializers.FloatField()
    lon = serializers.FloatField()


class PasajeroResumenSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    nombre = serializers.CharField()
    telefono = serializers.CharField()


class ConductorResumenSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    nombre = serializers.CharField(source="usuario.nombre")


class VehiculoResumenSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    patente = serializers.CharField()


class ConvenioResumenSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    cliente_nombre = serializers.CharField()


class VueloSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vuelo
        fields = ["numero", "fecha", "hora_programada", "hora_estimada", "estado_vuelo"]


class HistorialSerializer(serializers.ModelSerializer):
    usuario = serializers.CharField(source="usuario.nombre", default=None, read_only=True)

    class Meta:
        model = HistorialEstado
        fields = ["estado_anterior", "estado_nuevo", "actor", "usuario", "creado_en"]


def _ubicacion(direccion, punto) -> dict:
    return {"direccion": direccion, "lat": punto.y, "lon": punto.x}


class ViajeSerializer(serializers.ModelSerializer):
    pasajero = PasajeroResumenSerializer()
    conductor = ConductorResumenSerializer(allow_null=True)
    vehiculo = VehiculoResumenSerializer(allow_null=True)
    convenio = ConvenioResumenSerializer(allow_null=True)
    vuelo = serializers.SerializerMethodField()
    origen = serializers.SerializerMethodField()
    destino = serializers.SerializerMethodField()
    editable = serializers.SerializerMethodField()
    cancelable = serializers.SerializerMethodField()

    class Meta:
        model = Viaje
        fields = [
            "id",
            "estado",
            "canal",
            "sentido",
            "pasajero",
            "origen",
            "destino",
            "recogida_en",
            "tarifa",
            "conductor",
            "vehiculo",
            "convenio",
            "vuelo",
            "motivo_cancelacion",
            "origen_cancelacion",
            "creado_en",
            "editable",
            "cancelable",
        ]

    @extend_schema_field(VueloSerializer(allow_null=True))
    def get_vuelo(self, viaje):
        vuelo = getattr(viaje, "vuelo", None)
        return VueloSerializer(vuelo).data if vuelo else None

    @extend_schema_field(UbicacionSerializer)
    def get_origen(self, viaje):
        return _ubicacion(viaje.origen_dir, viaje.origen_geo)

    @extend_schema_field(UbicacionSerializer)
    def get_destino(self, viaje):
        return _ubicacion(viaje.destino_dir, viaje.destino_geo)

    def get_editable(self, viaje) -> bool:
        return viaje.estado in estados.EDITABLES

    def get_cancelable(self, viaje) -> bool:
        return viaje.estado in estados.CANCELABLES


class ViajeDetalleSerializer(ViajeSerializer):
    historial = HistorialSerializer(many=True, read_only=True)

    class Meta(ViajeSerializer.Meta):
        fields = [*ViajeSerializer.Meta.fields, "historial"]


class PasajeroEntradaSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=80)
    telefono = serializers.CharField(
        max_length=24, help_text="WhatsApp en formato E.164, p. ej. +56912345678."
    )

    def validate_nombre(self, valor):
        valor = valor.strip()
        if not valor:
            raise serializers.ValidationError("El nombre no puede estar vacío.")
        return valor

    def validate_telefono(self, valor):
        telefono = normalizar_telefono(valor)
        validar_telefono_e164(telefono)
        return telefono


class VueloEntradaSerializer(serializers.Serializer):
    numero = serializers.CharField(max_length=8, help_text="Código IATA, p. ej. LA123 o H2 456.")
    hora_programada = serializers.DateTimeField(help_text="Hora programada de llegada.")

    def validate_numero(self, valor):
        numero = " ".join(valor.upper().split())
        validar_vuelo_iata(numero)
        return numero


@extend_schema_field(OpenApiTypes.INT)
class _ConvenioDeLaEmpresa(serializers.PrimaryKeyRelatedField):
    """Solo convenios activos de la empresa del usuario (RN-08, RN-13)."""

    def get_queryset(self):
        return Convenio.objects.filter(empresa_id=self.context["request"].user.empresa_id, activo=True)


class ViajeCrearSerializer(serializers.Serializer):
    pasajero = PasajeroEntradaSerializer()
    canal = serializers.ChoiceField(
        choices=[Canal.TELEFONO, Canal.WHATSAPP, Canal.CONVENIO], default=Canal.TELEFONO
    )
    convenio = _ConvenioDeLaEmpresa(required=False, allow_null=True)
    sentido = serializers.ChoiceField(choices=Sentido.choices, default=Sentido.URBANO)
    origen_dir = serializers.CharField(max_length=200)
    destino_dir = serializers.CharField(max_length=200)
    recogida_en = serializers.DateTimeField()
    tarifa = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    vuelo = VueloEntradaSerializer(required=False, allow_null=True)

    def validate(self, datos):
        if datos["canal"] == Canal.CONVENIO and not datos.get("convenio"):
            raise serializers.ValidationError(
                {"convenio": "Indica el convenio para una reserva corporativa."}
            )
        if datos.get("convenio") and datos["canal"] != Canal.CONVENIO:
            raise serializers.ValidationError(
                {"canal": "Una reserva con convenio debe tener canal CONVENIO."}
            )
        for campo in ("origen_dir", "destino_dir"):
            datos[campo] = datos[campo].strip()
            if not datos[campo]:
                raise serializers.ValidationError({campo: "La dirección no puede estar vacía."})
        return datos


class ViajeEditarSerializer(serializers.Serializer):
    sentido = serializers.ChoiceField(choices=Sentido.choices, required=False)
    origen_dir = serializers.CharField(max_length=200, required=False)
    destino_dir = serializers.CharField(max_length=200, required=False)
    recogida_en = serializers.DateTimeField(required=False)
    tarifa = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    vuelo = VueloEntradaSerializer(required=False, allow_null=True)

    def validate(self, datos):
        for campo in ("origen_dir", "destino_dir"):
            if campo in datos:
                datos[campo] = datos[campo].strip()
                if not datos[campo]:
                    raise serializers.ValidationError({campo: "La dirección no puede estar vacía."})
        return datos


class CancelarSerializer(serializers.Serializer):
    motivo = serializers.CharField(max_length=200)

    def validate_motivo(self, valor):
        valor = valor.strip()
        if not valor:
            raise serializers.ValidationError("Indica el motivo de la cancelación.")
        return valor
