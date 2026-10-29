"""Datos sintéticos de flota para datos_demo: vehículos, conductores y sus asociaciones."""

from datetime import timedelta

from django.utils import timezone

from apps.comun.validadores import digito_verificador

from .models import Conductor, ConductorVehiculo, EstadoConductor, LicenciaClase, Vehiculo

MODELOS = [
    ("Toyota Yaris", 4),
    ("Hyundai Accent", 4),
    ("Chevrolet Sail", 4),
    ("Kia Rio", 4),
    ("Hyundai H-1", 7),
]

# Conductor i: (estado, índice del vehículo activo). El conductor 1 tiene dos vehículos (RN-05).
ESTADOS = [
    (EstadoConductor.DISPONIBLE, 0),
    (EstadoConductor.EN_VIAJE, 1),
    (EstadoConductor.DISPONIBLE, 2),
    (EstadoConductor.NO_DISPONIBLE, None),
]


def cargar(empresa, numero_empresa: int, usuarios_conductores) -> list[Conductor]:
    hoy = timezone.localdate()
    vehiculos = []
    for i, (modelo, capacidad) in enumerate(MODELOS):
        patente = f"DM{chr(65 + numero_empresa)}{chr(65 + i)}{10 + i:02d}"
        vehiculo, _ = Vehiculo.objects.get_or_create(
            patente=patente,
            defaults={
                "empresa": empresa,
                "marca_modelo": modelo,
                "anio": hoy.year - i,
                "capacidad": capacidad,
            },
        )
        vehiculos.append(vehiculo)

    conductores = []
    for i, usuario in enumerate(usuarios_conductores):
        estado, indice_vehiculo = ESTADOS[i]
        cuerpo_rut = str(15000000 + numero_empresa * 100 + i)
        conductor, creado = Conductor.objects.get_or_create(
            usuario=usuario,
            defaults={
                "rut": f"{cuerpo_rut}-{digito_verificador(cuerpo_rut)}",
                # Patrón evidente de número ficticio: +569 0000 E III.
                "telefono": f"+5690000{numero_empresa}{i + 1:03d}",
                "licencia_clase": LicenciaClase.A3 if i % 2 else LicenciaClase.A2,
                "licencia_vence": hoy + timedelta(days=365 * (i + 1)),
                "estado": estado,
                "vehiculo_activo": vehiculos[indice_vehiculo] if indice_vehiculo is not None else None,
                "consentimiento_gps_en": timezone.now() if estado != EstadoConductor.NO_DISPONIBLE else None,
            },
        )
        if creado:
            ConductorVehiculo.objects.create(conductor=conductor, vehiculo=vehiculos[i])
            if i == 0:
                ConductorVehiculo.objects.create(conductor=conductor, vehiculo=vehiculos[4])
        conductores.append(conductor)
    return conductores
