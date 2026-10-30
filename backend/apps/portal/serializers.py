from rest_framework import serializers

from apps.comun.validadores import normalizar_telefono, validar_telefono_e164, validar_vuelo_iata
from apps.cuentas.models import Empresa
from apps.reservas.models import Sentido


class EmpresaPublicaSerializer(serializers.ModelSerializer):
    anticipacion_minima_min = serializers.IntegerField(source="configuracion.anticipacion_minima_min")
    expiracion_verificacion_min = serializers.IntegerField(source="configuracion.expiracion_verificacion_min")
    margen_nacional_min = serializers.IntegerField(
        source="configuracion.margen_nacional_min",
        help_text="Minutos que se suman a la llegada del vuelo cuando no se indica la recogida (RN-17).",
    )

    class Meta:
        model = Empresa
        fields = [
            "razon_social",
            "slug",
            "anticipacion_minima_min",
            "expiracion_verificacion_min",
            "margen_nacional_min",
        ]


class VueloLlegadaSerializer(serializers.Serializer):
    numero = serializers.CharField(max_length=8, help_text="Código IATA, p. ej. LA123 o H2 456.")
    hora_llegada = serializers.DateTimeField(help_text="Hora programada de llegada del vuelo.")

    def validate_numero(self, valor):
        numero = " ".join(valor.upper().split())
        validar_vuelo_iata(numero)
        return numero


class SolicitudSerializer(serializers.Serializer):
    """HU-19: solicitud de viaje sin cuenta."""

    nombre = serializers.CharField(max_length=80)
    telefono = serializers.CharField(
        max_length=24, help_text="WhatsApp en formato E.164, p. ej. +56912345678."
    )
    origen_dir = serializers.CharField(max_length=200)
    destino_dir = serializers.CharField(max_length=200)
    recogida_en = serializers.DateTimeField(
        required=False,
        allow_null=True,
        help_text="Obligatoria, salvo en viajes desde el aeropuerto con vuelo: ahí se calcula si no viene.",
    )
    sentido = serializers.ChoiceField(
        choices=Sentido.choices,
        required=False,
        help_text="Si no viene: DESDE_AEROPUERTO cuando hay vuelo, URBANO si no.",
    )
    vuelo = VueloLlegadaSerializer(required=False, help_text="Solo para viajes desde el aeropuerto.")
    acepta_privacidad = serializers.BooleanField()
    acepta_whatsapp = serializers.BooleanField()
    # Campo trampa para bots: el formulario lo oculta; una persona lo deja vacío.
    sitio_web = serializers.CharField(required=False, allow_blank=True, write_only=True)

    def validate_nombre(self, valor):
        valor = valor.strip()
        if not valor:
            raise serializers.ValidationError("Ingresa tu nombre.")
        return valor

    def validate_telefono(self, valor):
        telefono = normalizar_telefono(valor)
        validar_telefono_e164(telefono)
        return telefono

    def validate_acepta_privacidad(self, valor):
        if not valor:
            raise serializers.ValidationError("Debes aceptar el aviso de privacidad.")
        return valor

    def validate_acepta_whatsapp(self, valor):
        if not valor:
            raise serializers.ValidationError(
                "Debes aceptar los avisos por WhatsApp para confirmar tu viaje."
            )
        return valor

    def validate(self, datos):
        for campo in ("origen_dir", "destino_dir"):
            datos[campo] = datos[campo].strip()
            if not datos[campo]:
                raise serializers.ValidationError({campo: "Ingresa la dirección."})
        if datos.get("recogida_en") is None:
            datos.pop("recogida_en", None)  # null del formulario = no informada
        vuelo = datos.get("vuelo")
        sentido = datos.setdefault("sentido", Sentido.DESDE_AEROPUERTO if vuelo else Sentido.URBANO)
        if vuelo and sentido != Sentido.DESDE_AEROPUERTO:
            raise serializers.ValidationError(
                {"vuelo": "El vuelo solo se informa en viajes desde el aeropuerto (llegadas)."}
            )
        if "recogida_en" not in datos and not (vuelo and sentido == Sentido.DESDE_AEROPUERTO):
            raise serializers.ValidationError({"recogida_en": "Indica la fecha y hora de recogida."})
        return datos


class SolicitudRespuestaSerializer(serializers.Serializer):
    estado = serializers.CharField()
    recogida_en = serializers.DateTimeField()
    expira_en = serializers.DateTimeField(help_text="Plazo para confirmar por WhatsApp (RN-06).")
    mensaje = serializers.CharField()
