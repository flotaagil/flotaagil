from rest_framework import serializers

from .models import Empresa, Usuario


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=120)
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)


class EmpresaResumenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empresa
        fields = ["id", "razon_social", "slug"]


class UsuarioSesionSerializer(serializers.ModelSerializer):
    empresa = EmpresaResumenSerializer(read_only=True)

    class Meta:
        model = Usuario
        fields = ["id", "nombre", "email", "rol", "empresa"]


class AccessSerializer(serializers.Serializer):
    access = serializers.CharField()


class SesionPanelSerializer(AccessSerializer):
    usuario = UsuarioSesionSerializer()


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class SesionAppSerializer(SesionPanelSerializer):
    refresh = serializers.CharField()


class TokensSerializer(AccessSerializer):
    refresh = serializers.CharField()
