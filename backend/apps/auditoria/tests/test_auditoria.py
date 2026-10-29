"""RN-12: AUDITORIA es de solo inserción."""

import pytest
from django.db import DatabaseError, connection, transaction

from apps.auditoria.models import Auditoria, AuditoriaInmutable
from apps.auditoria.servicios import registrar


@pytest.fixture
def registro(despachador):
    return registrar(
        usuario=despachador,
        entidad="VIAJE",
        entidad_id=1,
        accion="CANCELACION",
        motivo="Prueba",
        datos_previos={"estado": "SOLICITADO", "password": "no-debe-guardarse", "token_link": "x"},
    )


@pytest.mark.django_db
class TestAuditoria:
    def test_registra_empresa_del_usuario_y_omite_credenciales(self, registro, despachador):
        assert registro.empresa_id == despachador.empresa_id
        assert registro.datos_previos == {"estado": "SOLICITADO"}
        assert registro.creado_en is not None
        assert str(registro) == "CANCELACION VIAJE #1"

    def test_sin_datos_previos(self, despachador):
        assert (
            registrar(usuario=despachador, entidad="USUARIO", entidad_id=2, accion="X").datos_previos is None
        )

    def test_no_se_modifica_desde_el_modelo(self, registro):
        registro.motivo = "otro"
        with pytest.raises(AuditoriaInmutable):
            registro.save()
        with pytest.raises(AuditoriaInmutable):
            registro.delete()

    def test_no_se_modifica_desde_el_queryset(self, registro):
        with pytest.raises(AuditoriaInmutable):
            Auditoria.objects.filter(pk=registro.pk).update(motivo="otro")
        with pytest.raises(AuditoriaInmutable):
            Auditoria.objects.filter(pk=registro.pk).delete()

    @pytest.mark.parametrize(
        "sql", ["UPDATE auditoria SET motivo = 'otro' WHERE id = %s", "DELETE FROM auditoria WHERE id = %s"]
    )
    def test_el_trigger_lo_impide_en_la_base(self, registro, sql):
        with (
            pytest.raises(DatabaseError, match="solo inserción"),
            transaction.atomic(),
            connection.cursor() as cursor,
        ):
            cursor.execute(sql, [registro.pk])
        assert Auditoria.objects.get(pk=registro.pk).motivo == "Prueba"
