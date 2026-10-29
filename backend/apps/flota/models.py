"""CONDUCTOR, VEHICULO y CONDUCTOR_VEHICULO, según docs/diccionario-datos.md."""

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.db.models.functions import Now
from django.utils import timezone

from apps.comun.validadores import validar_movil_chile, validar_no_vacio, validar_patente, validar_rut

ANTIGUEDAD_MAXIMA_ANIOS = 12


def validar_anio_vehiculo(anio: int) -> None:
    """Antigüedad máxima del servicio: año ≥ año actual - 12."""
    minimo = timezone.localdate().year - ANTIGUEDAD_MAXIMA_ANIOS
    if anio < minimo:
        raise ValidationError(f"El vehículo debe ser del año {minimo} o posterior.", code="antiguedad")


class Vehiculo(models.Model):
    empresa = models.ForeignKey("cuentas.Empresa", on_delete=models.PROTECT, related_name="vehiculos")
    patente = models.CharField(max_length=8, unique=True, validators=[validar_patente])
    marca_modelo = models.CharField(max_length=60, validators=[validar_no_vacio])
    anio = models.PositiveSmallIntegerField(validators=[validar_anio_vehiculo])
    capacidad = models.PositiveSmallIntegerField(
        default=4, db_default=4, validators=[MinValueValidator(1), MaxValueValidator(7)]
    )
    activo = models.BooleanField(default=True, db_default=True)

    class Meta:
        db_table = "vehiculo"
        ordering = ["patente"]
        constraints = [
            models.CheckConstraint(
                condition=Q(capacidad__gte=1, capacidad__lte=7), name="vehiculo_capacidad_1_7"
            ),
            models.CheckConstraint(
                condition=Q(patente__regex=r"^([A-Z]{2}[0-9]{4}|[A-Z]{4}[0-9]{2})$"),
                name="vehiculo_patente_formato",
            ),
            models.CheckConstraint(condition=~Q(marca_modelo=""), name="vehiculo_marca_modelo_no_vacio"),
        ]

    def __str__(self):
        return f"{self.patente} ({self.marca_modelo})"


class LicenciaClase(models.TextChoices):
    A1 = "A1", "A1"
    A2 = "A2", "A2"
    A3 = "A3", "A3"


class EstadoConductor(models.TextChoices):
    DISPONIBLE = "DISPONIBLE", "Disponible"
    NO_DISPONIBLE = "NO_DISPONIBLE", "No disponible"
    EN_VIAJE = "EN_VIAJE", "En viaje"


class Conductor(models.Model):
    """La empresa del conductor es la de su usuario (USUARIO.empresa_id)."""

    usuario = models.OneToOneField("cuentas.Usuario", on_delete=models.PROTECT, related_name="conductor")
    rut = models.CharField(max_length=12, unique=True, validators=[validar_rut])
    telefono = models.CharField(max_length=16, validators=[validar_movil_chile])
    licencia_clase = models.CharField(max_length=4, choices=LicenciaClase.choices)
    licencia_vence = models.DateField()
    estado = models.CharField(
        max_length=14,
        choices=EstadoConductor.choices,
        default=EstadoConductor.NO_DISPONIBLE,
        db_default=EstadoConductor.NO_DISPONIBLE,
    )
    vehiculo_activo = models.ForeignKey(
        Vehiculo, on_delete=models.PROTECT, null=True, blank=True, related_name="conductores_activos"
    )
    consentimiento_gps_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "conductor"
        verbose_name_plural = "conductores"
        constraints = [
            models.CheckConstraint(
                condition=Q(licencia_clase__in=LicenciaClase.values), name="conductor_licencia_clase"
            ),
            models.CheckConstraint(
                condition=Q(estado__in=EstadoConductor.values), name="conductor_estado_valido"
            ),
            # RN-05: el vehículo declarado es obligatorio para quedar Disponible.
            models.CheckConstraint(
                condition=~Q(estado=EstadoConductor.DISPONIBLE) | Q(vehiculo_activo__isnull=False),
                name="conductor_disponible_con_vehiculo",
            ),
        ]

    def __str__(self):
        return self.usuario.nombre

    @property
    def empresa_id(self):
        return self.usuario.empresa_id

    def clean(self):
        if self._state.adding and self.licencia_vence and self.licencia_vence <= timezone.localdate():
            raise ValidationError(
                {"licencia_vence": "La licencia debe estar vigente al dar de alta al conductor."}
            )


class ConductorVehiculo(models.Model):
    pk = models.CompositePrimaryKey("conductor_id", "vehiculo_id")
    conductor = models.ForeignKey(Conductor, on_delete=models.CASCADE, related_name="asociaciones")
    vehiculo = models.ForeignKey(Vehiculo, on_delete=models.CASCADE, related_name="asociaciones")
    desde = models.DateField(db_default=Now())

    class Meta:
        db_table = "conductor_vehiculo"
        verbose_name = "asociación conductor-vehículo"
        verbose_name_plural = "asociaciones conductor-vehículo"

    def __str__(self):
        return f"{self.conductor} / {self.vehiculo}"
