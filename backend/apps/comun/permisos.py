"""Permisos por rol y aislamiento por empresa (RN-13)."""

from rest_framework.permissions import BasePermission


class TieneRol(BasePermission):
    """Permite el acceso solo a usuarios autenticados con alguno de los roles indicados."""

    roles: frozenset[str] = frozenset()

    def has_permission(self, request, view):
        usuario = request.user
        return bool(usuario and usuario.is_authenticated and usuario.rol in self.roles)


def con_roles(*roles: str) -> type[TieneRol]:
    """Clase de permiso para los roles dados: permission_classes = [con_roles(Rol.ADMINISTRADOR)]."""
    return type(f"TieneRol_{'_'.join(roles)}", (TieneRol,), {"roles": frozenset(roles)})


class AisladoPorEmpresaMixin:
    """RN-13: el queryset se limita a la empresa del usuario y los registros nuevos se asignan a ella.

    Un registro de otra empresa no existe para el usuario: el detalle responde 404 y no 403,
    para no revelar que existe. `campo_empresa` permite filtrar por una relación
    (p. ej. "usuario__empresa").
    """

    campo_empresa = "empresa"

    def get_queryset(self):
        return super().get_queryset().filter(**{self.campo_empresa: self.request.user.empresa_id})

    def perform_create(self, serializer):
        serializer.save(empresa=self.request.user.empresa)
