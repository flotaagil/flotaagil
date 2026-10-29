"""Validadores de dominio compartidos (Anexo D)."""

import re

from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator

RUT_RE = re.compile(r"^(\d{7,8})-([\dK])$")


def digito_verificador(cuerpo: str) -> str:
    """Dígito verificador del RUT (módulo 11)."""
    suma, factor = 0, 2
    for digito in reversed(cuerpo):
        suma += int(digito) * factor
        factor = 2 if factor == 7 else factor + 1
    resto = 11 - suma % 11
    return {11: "0", 10: "K"}.get(resto, str(resto))


def normalizar_rut(valor: str) -> str:
    """Quita puntos y espacios y pasa la K a mayúscula: «12.345.678-k» → «12345678-K»."""
    return valor.replace(".", "").replace(" ", "").upper()


def validar_rut(valor: str) -> None:
    """Formato 12345678-9 con dígito verificador válido."""
    coincidencia = RUT_RE.match(valor or "")
    if not coincidencia:
        raise ValidationError("RUT con formato inválido: se espera 12345678-9.", code="rut_formato")
    cuerpo, dv = coincidencia.groups()
    if digito_verificador(cuerpo) != dv:
        raise ValidationError("El dígito verificador del RUT no es válido.", code="rut_dv")


validar_kebab = RegexValidator(
    r"^[a-z0-9]+(-[a-z0-9]+)*$",
    "Debe estar en kebab-case: minúsculas, números y guiones (p. ej. transportes-andes).",
    code="kebab_case",
)


def validar_no_vacio(valor: str) -> None:
    if not (valor or "").strip():
        raise ValidationError("No puede estar vacío.", code="vacio")
