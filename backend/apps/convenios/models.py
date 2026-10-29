"""CONVENIO, según docs/diccionario-datos.md. La administración de convenios es HU-11."""

import secrets

from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.db.models import Q

from apps.comun.campos import CharFijo
from apps.comun.validadores import validar_no_vacio, validar_rut


def generar_token_link() -> str:
    """Token aleatorio de 256 bits en base64url: 43 caracteres."""
    return secrets.token_urlsafe(32)


class Convenio(models.Model):
    empresa = models.ForeignKey("cuentas.Empresa", on_delete=models.PROTECT, related_name="convenios")
    cliente_nombre = models.CharField(max_length=120, validators=[validar_no_vacio])
    cliente_rut = models.CharField(max_length=12, validators=[validar_rut])
    token_link = CharFijo(max_length=43, unique=True, default=generar_token_link, editable=False)
    password_hash = models.CharField(max_length=128)
    # RN-08: desactivar el convenio invalida su link sin afectar el historial.
    activo = models.BooleanField(default=True, db_default=True)

    class Meta:
        db_table = "convenio"
        ordering = ["cliente_nombre"]
        constraints = [
            models.CheckConstraint(condition=~Q(cliente_nombre=""), name="convenio_cliente_nombre_no_vacio"),
        ]

    def __str__(self):
        return self.cliente_nombre

    def set_password(self, password: str) -> None:
        self.password_hash = make_password(password)

    def check_password(self, password: str) -> bool:
        return check_password(password, self.password_hash)
