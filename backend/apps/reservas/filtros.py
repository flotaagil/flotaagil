import django_filters
from django.db.models import Q

from .models import Canal, EstadoViaje, Sentido, Viaje


class ViajeFiltro(django_filters.FilterSet):
    """Filtros del listado de reservas. Las fechas se interpretan en hora local (America/Santiago)."""

    estado = django_filters.MultipleChoiceFilter(
        choices=EstadoViaje.choices, help_text="Repetible: ?estado=A&estado=B"
    )
    sentido = django_filters.ChoiceFilter(choices=Sentido.choices)
    canal = django_filters.ChoiceFilter(choices=Canal.choices)
    fecha = django_filters.DateFilter(
        field_name="recogida_en", lookup_expr="date", help_text="Día de recogida"
    )
    desde = django_filters.IsoDateTimeFilter(field_name="recogida_en", lookup_expr="gte")
    hasta = django_filters.IsoDateTimeFilter(field_name="recogida_en", lookup_expr="lte")
    q = django_filters.CharFilter(
        method="buscar", help_text="Pasajero, teléfono, dirección o número de vuelo"
    )
    ordenar = django_filters.OrderingFilter(fields=["recogida_en", "creado_en"])

    class Meta:
        model = Viaje
        fields = []

    def buscar(self, queryset, nombre, valor):
        valor = valor.strip()
        if not valor:
            return queryset
        return queryset.filter(
            Q(pasajero__nombre__icontains=valor)
            | Q(pasajero__telefono__icontains=valor)
            | Q(origen_dir__icontains=valor)
            | Q(destino_dir__icontains=valor)
            | Q(vuelo__numero__icontains=valor)
        )
