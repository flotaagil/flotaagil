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


validar_telefono_e164 = RegexValidator(
    r"^\+[1-9]\d{7,14}$", "Teléfono en formato E.164, p. ej. +56912345678.", code="telefono_e164"
)

validar_movil_chile = RegexValidator(
    r"^\+569\d{8}$", "Teléfono móvil chileno en formato E.164: +569XXXXXXXX.", code="movil_chile"
)

validar_patente = RegexValidator(
    r"^([A-Z]{2}\d{4}|[A-Z]{4}\d{2})$", "Patente chilena: AB1234 o ABCD12.", code="patente"
)

# Código IATA de aerolínea (2 caracteres) + número de vuelo, con o sin espacio: LA123, H2 456.
validar_vuelo_iata = RegexValidator(
    r"^[A-Z0-9]{2} ?\d{1,4}$", "Número de vuelo IATA, p. ej. LA123 o H2 456.", code="vuelo_iata"
)


def normalizar_telefono(valor: str) -> str:
    """Quita espacios, guiones y paréntesis: «+56 9 1234-5678» → «+56912345678»."""
    return "".join(c for c in (valor or "") if c.isdigit() or c == "+")
