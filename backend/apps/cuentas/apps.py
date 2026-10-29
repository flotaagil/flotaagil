from django.apps import AppConfig


class CuentasConfig(AppConfig):
    name = "apps.cuentas"
    label = "cuentas"
    verbose_name = "Cuentas y empresas"

    def ready(self):
        from . import checks  # noqa: F401  (registra los system checks)
