from django.contrib import admin

from .models import Conductor, Vehiculo


@admin.register(Vehiculo)
class VehiculoAdmin(admin.ModelAdmin):
    list_display = ["patente", "marca_modelo", "anio", "capacidad", "empresa", "activo"]
    list_filter = ["empresa", "activo"]
    search_fields = ["patente", "marca_modelo"]


@admin.register(Conductor)
class ConductorAdmin(admin.ModelAdmin):
    list_display = ["usuario", "rut", "estado", "vehiculo_activo", "licencia_vence"]
    list_filter = ["estado", "usuario__empresa"]
    search_fields = ["usuario__nombre", "rut"]
