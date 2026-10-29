"""Admin de Django: solo mantenimiento interno (DC-04). Los usuarios del sistema operan desde el panel web."""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.forms import BaseUserCreationForm, UserChangeForm

from .models import ConfiguracionEmpresa, Empresa, Usuario


class UsuarioCreacionForm(BaseUserCreationForm):
    class Meta:
        model = Usuario
        fields = ["email", "nombre", "empresa", "rol"]


class UsuarioCambioForm(UserChangeForm):
    class Meta:
        model = Usuario
        fields = "__all__"


class ConfiguracionEmpresaInline(admin.StackedInline):
    model = ConfiguracionEmpresa
    can_delete = False


@admin.register(Empresa)
class EmpresaAdmin(admin.ModelAdmin):
    list_display = ["razon_social", "rut", "slug", "plan", "activa"]
    list_filter = ["plan", "activa"]
    search_fields = ["razon_social", "rut", "slug"]
    inlines = [ConfiguracionEmpresaInline]


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    form = UsuarioCambioForm
    add_form = UsuarioCreacionForm
    ordering = ["email"]
    list_display = ["email", "nombre", "rol", "empresa", "activo", "bloqueado_hasta"]
    list_filter = ["rol", "activo", "empresa"]
    search_fields = ["email", "nombre"]
    fieldsets = [
        (None, {"fields": ["email", "password"]}),
        ("Datos", {"fields": ["nombre", "empresa", "rol"]}),
        ("Estado", {"fields": ["activo", "intentos_fallidos", "bloqueado_hasta", "last_login"]}),
        ("Mantenimiento", {"fields": ["is_staff", "is_superuser", "groups", "user_permissions"]}),
    ]
    add_fieldsets = [
        (None, {"fields": ["email", "nombre", "empresa", "rol", "password1", "password2"]}),
    ]
    readonly_fields = ["last_login"]
