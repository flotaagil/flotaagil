from django.contrib import admin

from .models import Auditoria


@admin.register(Auditoria)
class AuditoriaAdmin(admin.ModelAdmin):
    """Solo lectura: AUDITORIA es de solo inserción (RN-12)."""

    list_display = ["creado_en", "empresa", "usuario", "entidad", "entidad_id", "accion"]
    list_filter = ["entidad", "accion", "empresa"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
