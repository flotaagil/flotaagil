"""EMPRESA, CONFIGURACION_EMPRESA (DC-02) y USUARIO, según docs/diccionario-datos.md."""

from decimal import Decimal

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models, transaction
from django.db.models import F, Q
from django.db.models.functions import Now

from apps.comun.validadores import validar_kebab, validar_no_vacio, validar_rut


class Plan(models.TextChoices):
    BASICO = "BASICO", "Básico"
    FLOTA_PLUS = "FLOTA_PLUS", "Flota Plus"


class Empresa(models.Model):
    rut = models.CharField(max_length=12, unique=True, validators=[validar_rut])
    razon_social = models.CharField(max_length=120, validators=[validar_no_vacio])
    # DC-01: identificador de la empresa en la URL del portal (/solicitar/<slug>).
    slug = models.CharField(max_length=50, unique=True, validators=[validar_kebab])
    plan = models.CharField(max_length=12, choices=Plan.choices, default=Plan.BASICO, db_default=Plan.BASICO)
    activa = models.BooleanField(default=True, db_default=True)
    creado_en = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "empresa"
        ordering = ["razon_social"]
        constraints = [
            models.CheckConstraint(condition=~Q(razon_social=""), name="empresa_razon_social_no_vacia"),
            models.CheckConstraint(condition=Q(plan__in=Plan.values), name="empresa_plan_valido"),
            models.CheckConstraint(
                condition=Q(slug__regex=r"^[a-z0-9]+(-[a-z0-9]+)*$"), name="empresa_slug_kebab"
            ),
        ]

    def __str__(self):
        return self.razon_social

    def save(self, *args, **kwargs):
        nueva = self._state.adding
        with transaction.atomic():
            super().save(*args, **kwargs)
            if nueva:
                ConfiguracionEmpresa.objects.create(empresa=self)


def _minutos(defecto: int, minimo: int = 0):
    return models.PositiveSmallIntegerField(
        default=defecto, db_default=defecto, validators=[MinValueValidator(minimo)]
    )


def _coordenada(defecto: str, limite: int):
    return models.DecimalField(
        max_digits=9,
        decimal_places=6,
        default=Decimal(defecto),
        db_default=Decimal(defecto),
        validators=[MinValueValidator(-limite), MaxValueValidator(limite)],
    )


class ConfiguracionEmpresa(models.Model):
    """DC-02: parámetros configurables por empresa, con los valores por defecto del informe."""

    empresa = models.OneToOneField(
        Empresa, on_delete=models.CASCADE, primary_key=True, related_name="configuracion"
    )
    margen_nacional_min = _minutos(20)
    margen_internacional_min = _minutos(35)
    tolerancia_fila_min = _minutos(10)
    espera_no_presentacion_min = _minutos(15)
    expiracion_verificacion_min = _minutos(15, minimo=1)
    # DC-10: anticipación mínima de una solicitud del portal respecto de la hora de recogida.
    anticipacion_minima_min = _minutos(30)
    # Zona de operación: rectángulo aproximado de la Región Metropolitana por defecto.
    zona_lat_min = _coordenada("-34.300000", 90)
    zona_lat_max = _coordenada("-32.920000", 90)
    zona_lon_min = _coordenada("-71.720000", 180)
    zona_lon_max = _coordenada("-69.770000", 180)

    class Meta:
        db_table = "configuracion_empresa"
        verbose_name = "configuración de empresa"
        verbose_name_plural = "configuraciones de empresa"
        constraints = [
            models.CheckConstraint(condition=Q(zona_lat_min__lt=F("zona_lat_max")), name="zona_lat_ordenada"),
            models.CheckConstraint(condition=Q(zona_lon_min__lt=F("zona_lon_max")), name="zona_lon_ordenada"),
            models.CheckConstraint(
                condition=Q(expiracion_verificacion_min__gte=1), name="expiracion_verificacion_positiva"
            ),
        ]

    def __str__(self):
        return f"Configuración de {self.empresa}"

    def contiene(self, lat: float, lon: float) -> bool:
        """¿El punto está dentro de la zona de operación de la empresa?"""
        return float(self.zona_lat_min) <= lat <= float(self.zona_lat_max) and float(
            self.zona_lon_min
        ) <= lon <= float(self.zona_lon_max)


class Rol(models.TextChoices):
    ADMINISTRADOR = "ADMINISTRADOR", "Administrador"
    DESPACHADOR = "DESPACHADOR", "Despachador"
    CONDUCTOR = "CONDUCTOR", "Conductor"


class UsuarioManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **campos):
        if not email:
            raise ValueError("El usuario necesita un email.")
        usuario = self.model(email=self.normalize_email(email).lower(), **campos)
        usuario.set_password(password)
        usuario.save(using=self._db)
        return usuario

    def create_superuser(self, email, password=None, **campos):
        campos.setdefault("rol", Rol.ADMINISTRADOR)
        campos.update(is_staff=True, is_superuser=True)
        return self.create_user(email, password, **campos)


class Usuario(AbstractBaseUser, PermissionsMixin):
    """USUARIO del Anexo D. Las columnas técnicas de Django (last_login, is_superuser, is_staff y
    las tablas de grupos y permisos) están documentadas en DC-04."""

    empresa = models.ForeignKey(Empresa, on_delete=models.PROTECT, related_name="usuarios")
    nombre = models.CharField(max_length=80, validators=[validar_no_vacio])
    email = models.EmailField(max_length=120, unique=True)
    # Django guarda el hash PBKDF2-SHA256 con salt en «password»; la columna se llama como en el Anexo D.
    password = models.CharField(max_length=128, db_column="password_hash")
    rol = models.CharField(max_length=14, choices=Rol.choices)
    activo = models.BooleanField(default=True, db_default=True)
    intentos_fallidos = models.PositiveSmallIntegerField(
        default=0, db_default=0, validators=[MaxValueValidator(5)]
    )
    bloqueado_hasta = models.DateTimeField(null=True, blank=True)
    is_staff = models.BooleanField(default=False, db_default=False)

    objects = UsuarioManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["nombre", "empresa", "rol"]

    class Meta:
        db_table = "usuario"
        ordering = ["nombre"]
        constraints = [
            models.CheckConstraint(condition=Q(rol__in=Rol.values), name="usuario_rol_valido"),
            models.CheckConstraint(
                condition=Q(intentos_fallidos__lte=5), name="usuario_intentos_fallidos_max_5"
            ),
            models.CheckConstraint(condition=~Q(nombre=""), name="usuario_nombre_no_vacio"),
        ]

    def __str__(self):
        return f"{self.nombre} <{self.email}>"

    @property
    def is_active(self):
        """Django usa is_active; en el Anexo D la columna es «activo» (DC-04)."""
        return self.activo
