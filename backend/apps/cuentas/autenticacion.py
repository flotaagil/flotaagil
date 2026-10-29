"""Inicio de sesión con bloqueo tras intentos fallidos y emisión de tokens JWT."""

from django.conf import settings
from django.contrib.auth.models import update_last_login
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Rol, Usuario

ROLES_PANEL = frozenset({Rol.ADMINISTRADOR, Rol.DESPACHADOR})
ROLES_APP = frozenset({Rol.CONDUCTOR})

MENSAJE_CREDENCIALES = "Correo o contraseña incorrectos."


class CuentaBloqueada(AuthenticationFailed):
    default_detail = "La cuenta está bloqueada temporalmente por intentos fallidos. Intenta más tarde."
    default_code = "cuenta_bloqueada"


def _registrar_fallo(usuario: Usuario) -> None:
    usuario.intentos_fallidos = min(usuario.intentos_fallidos + 1, settings.LOGIN_MAX_INTENTOS)
    if usuario.intentos_fallidos >= settings.LOGIN_MAX_INTENTOS:
        usuario.bloqueado_hasta = timezone.now() + settings.LOGIN_BLOQUEO
    usuario.save(update_fields=["intentos_fallidos", "bloqueado_hasta"])


def _bloqueo_vigente(usuario: Usuario) -> bool:
    if usuario.bloqueado_hasta is None:
        return False
    if usuario.bloqueado_hasta > timezone.now():
        return True
    # El bloqueo venció: se parte de cero.
    Usuario.objects.filter(pk=usuario.pk).update(intentos_fallidos=0, bloqueado_hasta=None)
    usuario.intentos_fallidos, usuario.bloqueado_hasta = 0, None
    return False


def autenticar(email: str, password: str, roles_permitidos: frozenset[str]) -> Usuario:
    """Valida credenciales, aplica el bloqueo y el rol del canal (panel o app)."""
    usuario = Usuario.objects.select_related("empresa").filter(email__iexact=email.strip()).first()
    if usuario is None:
        raise AuthenticationFailed(MENSAJE_CREDENCIALES, code="credenciales_invalidas")
    if _bloqueo_vigente(usuario):
        raise CuentaBloqueada()
    if not usuario.check_password(password):
        _registrar_fallo(usuario)
        if usuario.bloqueado_hasta:
            raise CuentaBloqueada()
        raise AuthenticationFailed(MENSAJE_CREDENCIALES, code="credenciales_invalidas")
    if not usuario.activo or not usuario.empresa.activa:
        raise AuthenticationFailed("La cuenta está deshabilitada.", code="cuenta_deshabilitada")
    if usuario.rol not in roles_permitidos:
        raise PermissionDenied("Este acceso no corresponde a tu rol.", code="rol_no_permitido")

    if usuario.intentos_fallidos:
        Usuario.objects.filter(pk=usuario.pk).update(intentos_fallidos=0)
        usuario.intentos_fallidos = 0
    update_last_login(None, usuario)
    return usuario


def emitir_tokens(usuario: Usuario) -> RefreshToken:
    """Refresh con el rol y la empresa como claims; el access los hereda."""
    refresh = RefreshToken.for_user(usuario)
    refresh["rol"] = usuario.rol
    refresh["empresa_id"] = usuario.empresa_id
    return refresh
