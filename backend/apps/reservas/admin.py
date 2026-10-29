from django.contrib import admin

from .models import HistorialEstado, Pasajero, Viaje


@admin.register(Pasajero)
class PasajeroAdmin(admin.ModelAdmin):
    list_display = ["nombre", "telefono", "empresa", "verificado_en"]
    list_filter = ["empresa"]
    search_fields = ["nombre", "telefono"]


class HistorialInline(admin.TabularInline):
    model = HistorialEstado
    extra = 0
    can_delete = False
    readonly_fields = ["estado_anterior", "estado_nuevo", "actor", "usuario", "creado_en"]

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Viaje)
class ViajeAdmin(admin.ModelAdmin):
    """Consulta para mantenimiento; los cambios de estado se hacen por la API (máquina de estados)."""

    list_display = ["id", "estado", "canal", "sentido", "pasajero", "recogida_en", "empresa"]
    list_filter = ["estado", "canal", "sentido", "empresa"]
    search_fields = ["pasajero__nombre", "origen_dir", "destino_dir"]
    inlines = [HistorialInline]

    def has_change_permission(self, request, obj=None):
        return False
