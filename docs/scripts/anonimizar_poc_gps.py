"""Anonimiza los CSV exportados por la PoC de GPS (H-3) antes de subirlos al repositorio.

posiciones.csv: elimina lat, lon, altitud_m y rumbo, y agrega distancia_m (metros desde la
posición anterior de la misma sesión). Sin coordenadas ni rumbo no se puede reconstruir dónde
estuvo el teléfono ni la forma del recorrido.
eventos.csv: no tiene coordenadas; se copia tal cual tras verificarlo.

Uso, desde la raíz del repositorio:
    python docs/scripts/anonimizar_poc_gps.py <csv> [<csv> ...] [--salida docs/evidencias/H-3]

Ejemplo:
    python docs/scripts/anonimizar_poc_gps.py "%USERPROFILE%/Downloads/H-3/E1-posiciones.csv" \
        "%USERPROFILE%/Downloads/H-3/E1-eventos.csv"
    → docs/evidencias/H-3/E1-posiciones-anon.csv y E1-eventos-anon.csv

Los CSV originales quedan donde estaban; nunca se copian al repositorio.
"""

import argparse
import csv
import math
import sys
from pathlib import Path

ELIMINAR = {"lat", "lon", "altitud_m", "rumbo"}
PROHIBIDAS = ELIMINAR | {"latitude", "longitude", "latitud", "longitud", "altitude", "bearing"}
COLUMNAS_EVENTOS = ["sesion", "recibido_iso", "recibido_ms", "tipo", "detalle"]
RADIO_TIERRA_M = 6_371_008.8


def distancia_m(lat1, lon1, lat2, lon2):
    """Distancia haversine en metros."""
    f1, f2 = math.radians(lat1), math.radians(lat2)
    df = f2 - f1
    dl = math.radians(lon2 - lon1)
    a = math.sin(df / 2) ** 2 + math.cos(f1) * math.cos(f2) * math.sin(dl / 2) ** 2
    return 2 * RADIO_TIERRA_M * math.asin(math.sqrt(a))


def anonimizar_posiciones(filas, columnas):
    salida_cols = [c for c in columnas if c not in ELIMINAR]
    salida_cols.insert(salida_cols.index("precision_m"), "distancia_m")
    anterior = {}
    salida = []
    for fila in filas:
        lat, lon = float(fila["lat"]), float(fila["lon"])
        previa = anterior.get(fila["sesion"])
        nueva = {c: fila[c] for c in salida_cols if c != "distancia_m"}
        nueva["distancia_m"] = "" if previa is None else f"{distancia_m(*previa, lat, lon):.1f}"
        anterior[fila["sesion"]] = (lat, lon)
        salida.append(nueva)
    return salida_cols, salida


def procesar(origen: Path, carpeta: Path, forzar: bool) -> Path:
    with origen.open(encoding="utf-8", newline="") as f:
        lector = csv.DictReader(f)
        columnas = lector.fieldnames or []
        filas = list(lector)

    if {"lat", "lon"} <= set(columnas):
        columnas, filas = anonimizar_posiciones(filas, columnas)
    elif columnas != COLUMNAS_EVENTOS:
        sys.exit(f"{origen.name}: no reconozco el formato (ni posiciones ni eventos). No se procesa.")

    restantes = PROHIBIDAS & set(columnas)
    if restantes:
        sys.exit(f"{origen.name}: quedarían columnas con ubicación {sorted(restantes)}. No se escribe nada.")

    destino = carpeta / f"{origen.stem}-anon.csv"
    if destino.exists() and not forzar:
        sys.exit(f"{destino} ya existe. Usa --forzar para reemplazarlo.")
    carpeta.mkdir(parents=True, exist_ok=True)
    with destino.open("w", encoding="utf-8", newline="") as f:
        escritor = csv.DictWriter(f, fieldnames=columnas, lineterminator="\n")
        escritor.writeheader()
        escritor.writerows(filas)
    return destino


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("csv", nargs="+", type=Path, help="CSV exportados por la app (originales)")
    parser.add_argument("--salida", type=Path, default=Path("docs/evidencias/H-3"))
    parser.add_argument("--forzar", action="store_true", help="reemplaza archivos -anon.csv existentes")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    for origen in args.csv:
        if args.salida.resolve() in origen.resolve().parents:
            sys.exit(f"{origen}: el original está dentro de la carpeta de evidencias; muévelo fuera del repo.")
        destino = procesar(origen, args.salida, args.forzar)
        with destino.open(encoding="utf-8") as f:
            print(f"{origen.name} → {destino} ({sum(1 for _ in f) - 1} filas)")


if __name__ == "__main__":
    main()
