from .models import Auditoria

# Nunca se guardan credenciales en datos_previos.
CLAVES_SENSIBLES = {"password", "password_hash", "token_link"}


def registrar(
    *, usuario, entidad: str, entidad_id: int, accion: str, motivo=None, datos_previos=None
) -> Auditoria:
    datos = {k: v for k, v in (datos_previos or {}).items() if k not in CLAVES_SENSIBLES} or None
    return Auditoria.objects.create(
        empresa_id=usuario.empresa_id,
        usuario=usuario,
        entidad=entidad,
        entidad_id=entidad_id,
        accion=accion,
        motivo=motivo,
        datos_previos=datos,
    )
