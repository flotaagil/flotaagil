"""PASAJERO, VIAJE e HISTORIAL_ESTADO, según docs/diccionario-datos.md."""

from django.contrib.gis.db import models as gis
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.db.models.functions import Now

from apps.comun.validadores import validar_no_vacio, validar_telefono_e164


class Pasajero(models.Model):
    """El pasajero no tiene cuenta; se identifica por su WhatsApp, único dentro de cada empresa."""

    empresa = models.ForeignKey("cuentas.Empresa", on_delete=models.PROTECT, related_name="pasajeros")
    nombre = models.CharField(max_length=80, validators=[validar_no_vacio])
    telefono = models.CharField(max_length=16, validators=[validar_telefono_e164])
    verificado_en = models.DateTimeField(null=True, blank=True)
    opt_in_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "pasajero"
        ordering = ["nombre"]
        constraints = [
            models.UniqueConstraint(
                fields=["empresa", "telefono"], name="pasajero_telefono_unico_por_empresa"
            ),
            models.CheckConstraint(condition=~Q(nombre=""), name="pasajero_nombre_no_vacio"),
        ]

    def __str__(self):
        return f"{self.nombre} ({self.telefono})"


class EstadoViaje(models.TextChoices):
    PENDIENTE_CONFIRMACION = "PENDIENTE_CONFIRMACION", "Pendiente de confirmación"
    SOLICITADO = "SOLICITADO", "Solicitado"
    ASIGNADO = "ASIGNADO", "Asignado"
    ACEPTADO = "ACEPTADO", "Aceptado"
    EN_CAMINO = "EN_CAMINO", "En camino"
    EN_ZONA = "EN_ZONA", "En zona"
    PASAJERO_A_BORDO = "PASAJERO_A_BORDO", "Pasajero a bordo"
    FINALIZADO = "FINALIZADO", "Finalizado"
    CANCELADO = "CANCELADO", "Cancelado"


class Canal(models.TextChoices):
    WEB = "WEB", "Portal web"
    WHATSAPP = "WHATSAPP", "WhatsApp"
    TELEFONO = "TELEFONO", "Teléfono"
    CONVENIO = "CONVENIO", "Convenio"


class Sentido(models.TextChoices):
    DESDE_AEROPUERTO = "DESDE_AEROPUERTO", "Desde el aeropuerto"
    HACIA_AEROPUERTO = "HACIA_AEROPUERTO", "Hacia el aeropuerto"
    URBANO = "URBANO", "Urbano"


class OrigenCancelacion(models.TextChoices):
    PASAJERO = "PASAJERO", "Pasajero"
    DESPACHADOR = "DESPACHADOR", "Despachador"
    SUPERVISOR = "SUPERVISOR", "Supervisor de convenio"
    SISTEMA = "SISTEMA", "Sistema"


class Viaje(models.Model):
    empresa = models.ForeignKey("cuentas.Empresa", on_delete=models.PROTECT, related_name="viajes")
    pasajero = models.ForeignKey(Pasajero, on_delete=models.PROTECT, related_name="viajes")
    convenio = models.ForeignKey(
        "convenios.Convenio", on_delete=models.PROTECT, null=True, blank=True, related_name="viajes"
    )
    conductor = models.ForeignKey(
        "flota.Conductor", on_delete=models.PROTECT, null=True, blank=True, related_name="viajes"
    )
    vehiculo = models.ForeignKey(
        "flota.Vehiculo", on_delete=models.PROTECT, null=True, blank=True, related_name="viajes"
    )
    canal = models.CharField(max_length=12, choices=Canal.choices)
    sentido = models.CharField(
        max_length=16, choices=Sentido.choices, default=Sentido.URBANO, db_default=Sentido.URBANO
    )
    origen_dir = models.CharField(max_length=200, validators=[validar_no_vacio])
    origen_geo = gis.PointField(geography=True, srid=4326)
    destino_dir = models.CharField(max_length=200, validators=[validar_no_vacio])
    destino_geo = gis.PointField(geography=True, srid=4326)
    recogida_en = models.DateTimeField()
    estado = models.CharField(
        max_length=22,
        choices=EstadoViaje.choices,
        default=EstadoViaje.PENDIENTE_CONFIRMACION,
        db_default=EstadoViaje.PENDIENTE_CONFIRMACION,
    )
    tarifa = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(0)])
    motivo_cancelacion = models.CharField(max_length=200, null=True, blank=True)
    origen_cancelacion = models.CharField(
        max_length=14, choices=OrigenCancelacion.choices, null=True, blank=True
    )
    creado_en = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "viaje"
        ordering = ["recogida_en", "id"]
        indexes = [
            models.Index(fields=["empresa", "recogida_en"], name="viaje_empresa_recogida_idx"),
            models.Index(fields=["empresa", "estado"], name="viaje_empresa_estado_idx"),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(estado__in=EstadoViaje.values), name="viaje_estado_valido"),
            models.CheckConstraint(condition=Q(canal__in=Canal.values), name="viaje_canal_valido"),
            models.CheckConstraint(condition=Q(sentido__in=Sentido.values), name="viaje_sentido_valido"),
            models.CheckConstraint(
                condition=Q(tarifa__isnull=True) | Q(tarifa__gte=0), name="viaje_tarifa_no_negativa"
            ),
            models.CheckConstraint(
                condition=~Q(estado=EstadoViaje.CANCELADO)
                | (Q(motivo_cancelacion__isnull=False) & ~Q(motivo_cancelacion="")),
                name="viaje_cancelado_con_motivo",
            ),
            models.CheckConstraint(
                condition=Q(canal=Canal.CONVENIO, convenio__isnull=False)
                | (~Q(canal=Canal.CONVENIO) & Q(convenio__isnull=True)),
                name="viaje_convenio_segun_canal",
            ),
        ]

    def __str__(self):
        return f"Viaje #{self.pk} ({self.estado})"


class Actor(models.TextChoices):
    CONDUCTOR = "CONDUCTOR", "Conductor"
    DESPACHADOR = "DESPACHADOR", "Despachador"
    # DC-03: agregado al dominio del Anexo D.
    ADMINISTRADOR = "ADMINISTRADOR", "Administrador"
    PASAJERO = "PASAJERO", "Pasajero"
    SISTEMA = "SISTEMA", "Sistema"


class HistorialEstado(models.Model):
    viaje = models.ForeignKey(Viaje, on_delete=models.CASCADE, related_name="historial")
    estado_anterior = models.CharField(max_length=22, choices=EstadoViaje.choices, null=True, blank=True)
    estado_nuevo = models.CharField(max_length=22, choices=EstadoViaje.choices)
    actor = models.CharField(max_length=14, choices=Actor.choices)
    usuario = models.ForeignKey(
        "cuentas.Usuario", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    creado_en = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "historial_estado"
        verbose_name = "historial de estado"
        verbose_name_plural = "historial de estados"
        ordering = ["creado_en", "id"]
        constraints = [
            models.CheckConstraint(condition=Q(actor__in=Actor.values), name="historial_actor_valido"),
            models.CheckConstraint(
                condition=Q(estado_nuevo__in=EstadoViaje.values), name="historial_estado_valido"
            ),
        ]

    def __str__(self):
        return f"{self.estado_anterior or '—'} → {self.estado_nuevo} ({self.actor})"
