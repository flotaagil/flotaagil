# Imagen de desarrollo del backend. GDAL, GEOS y PROJ vienen de los paquetes de Debian (GeoDjango).
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends gdal-bin \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt requirements-dev.txt ./
RUN pip install -r requirements-dev.txt

COPY . .

RUN useradd --create-home --uid 1000 django
USER django

EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
