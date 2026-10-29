import pytest
from django.db import connection

from apps.convenios.models import Convenio, generar_token_link
from apps.reservas.tests.fabricas import ConvenioFactory


def test_token_de_256_bits_en_43_caracteres():
    tokens = {generar_token_link() for _ in range(50)}
    assert len(tokens) == 50
    assert all(len(t) == 43 for t in tokens)


@pytest.mark.django_db
class TestConvenio:
    def test_token_char_43_en_la_base(self):
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT data_type, character_maximum_length FROM information_schema.columns "
                "WHERE table_name = 'convenio' AND column_name = 'token_link'"
            )
            assert cursor.fetchone() == ("character", 43)

    def test_contrasena_con_hash(self, empresa):
        convenio = Convenio(empresa=empresa, cliente_nombre="Cliente", cliente_rut="12345678-5")
        convenio.set_password("clave-del-convenio")
        convenio.save()
        assert convenio.password_hash.startswith("pbkdf2_sha256$")
        assert convenio.check_password("clave-del-convenio")
        assert not convenio.check_password("otra")

    def test_activo_por_defecto(self):
        convenio = ConvenioFactory()
        assert convenio.activo is True
        assert str(convenio) == convenio.cliente_nombre
