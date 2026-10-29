"""RN-13 y permisos por rol, probados con una vista mínima sobre USUARIO."""

import pytest
from rest_framework import serializers, viewsets
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.comun.permisos import AisladoPorEmpresaMixin, con_roles
from apps.cuentas.models import Rol, Usuario
from apps.cuentas.tests.fabricas import UsuarioFactory


class _UsuarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Usuario
        fields = ["id", "nombre", "email", "rol"]


class _UsuariosVista(AisladoPorEmpresaMixin, viewsets.ReadOnlyModelViewSet):
    queryset = Usuario.objects.all()
    serializer_class = _UsuarioSerializer
    permission_classes = [con_roles(Rol.ADMINISTRADOR, Rol.DESPACHADOR)]
    pagination_class = None


fabrica = APIRequestFactory()
listar = _UsuariosVista.as_view({"get": "list"})
detalle = _UsuariosVista.as_view({"get": "retrieve"})


def _get(vista, usuario, **kwargs):
    peticion = fabrica.get("/")
    force_authenticate(peticion, user=usuario)
    return vista(peticion, **kwargs)


@pytest.mark.django_db
class TestAislamientoPorEmpresa:
    def test_lista_solo_registros_de_su_empresa(self, administrador, otra_empresa):
        colega = UsuarioFactory(empresa=administrador.empresa)
        ajeno = UsuarioFactory(empresa=otra_empresa)
        ids = {u["id"] for u in _get(listar, administrador).data}
        assert ids == {administrador.id, colega.id}
        assert ajeno.id not in ids

    def test_registro_de_otra_empresa_responde_404(self, administrador, otra_empresa):
        ajeno = UsuarioFactory(empresa=otra_empresa)
        assert _get(detalle, administrador, pk=ajeno.pk).status_code == 404

    def test_registro_propio_responde_200(self, administrador):
        assert _get(detalle, administrador, pk=administrador.pk).status_code == 200

    def test_perform_create_asigna_la_empresa_del_usuario(self, administrador, otra_empresa):
        class _Serializer:
            guardado = None

            def save(self, **kwargs):
                self.guardado = kwargs

        vista = _UsuariosVista()
        vista.request = type("R", (), {"user": administrador})()
        serializer = _Serializer()
        vista.perform_create(serializer)
        assert serializer.guardado == {"empresa": administrador.empresa}


@pytest.mark.django_db
class TestPermisosPorRol:
    def test_conductor_no_tiene_acceso(self, conductor):
        assert _get(listar, conductor).status_code == 403

    def test_despachador_tiene_acceso(self, despachador):
        assert _get(listar, despachador).status_code == 200

    def test_sin_autenticar(self, db):
        respuesta = listar(fabrica.get("/"))
        assert respuesta.status_code == 401
