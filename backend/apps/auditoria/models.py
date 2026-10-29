"""AUDITORIA: registro de solo inserción (RN-11, RN-12). Un trigger en la base de datos impide
modificar o borrar filas, además de la protección en el modelo."""

from django.db import models
from django.db.models import Q
from django.db.models.functions import Now


class Entidad(models.TextChoices):
    CONVENIO = "CONVENIO", "Convenio"
    VIAJE = "VIAJE", "Viaje"
    PAGO_VIAJE = "PAGO_VIAJE", "Pago de viaje"
    USUARIO = "USUARIO", "Usuario"


class AuditoriaInmutable(Exception):
    pass


class AuditoriaQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise AuditoriaInmutable("AUDITORIA es de solo inserción.")

    def delete(self):
        raise AuditoriaInmutable("AUDITORIA es de solo inserción.")


class Auditoria(models.Model):
    empresa = models.ForeignKey("cuentas.Empresa", on_delete=models.PROTECT, related_name="+")
    usuario = models.ForeignKey("cuentas.Usuario", on_delete=models.PROTECT, related_name="+")
    entidad = models.CharField(max_length=30, choices=Entidad.choices)
    entidad_id = models.BigIntegerField()
    accion = models.CharField(max_length=30)
    motivo = models.CharField(max_length=200, null=True, blank=True)
    datos_previos = models.JSONField(null=True, blank=True)
    creado_en = models.DateTimeField(db_default=Now(), editable=False)

    objects = AuditoriaQuerySet.as_manager()

    class Meta:
        db_table = "auditoria"
        verbose_name_plural = "auditoría"
        ordering = ["-creado_en", "-id"]
        indexes = [models.Index(fields=["entidad", "entidad_id"], name="auditoria_entidad_idx")]
        constraints = [
            models.CheckConstraint(condition=Q(entidad__in=Entidad.values), name="auditoria_entidad_valida")
        ]

    def __str__(self):
        return f"{self.accion} {self.entidad} #{self.entidad_id}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise AuditoriaInmutable("AUDITORIA es de solo inserción.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise AuditoriaInmutable("AUDITORIA es de solo inserción.")
