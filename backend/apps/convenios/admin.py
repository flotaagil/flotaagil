from django.contrib import admin

from .models import Convenio


@admin.register(Convenio)
class ConvenioAdmin(admin.ModelAdmin):
    list_display = ["cliente_nombre", "cliente_rut", "empresa", "activo"]
    list_filter = ["empresa", "activo"]
    exclude = ["password_hash"]
