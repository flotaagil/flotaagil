"""Configuración de FlotaÁgil. Los valores sensibles o propios del entorno se leen de variables de entorno."""

from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
if (BASE_DIR / ".env").exists():
    environ.Env.read_env(BASE_DIR / ".env", overwrite=False)

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
ADMIN_URL = env("DJANGO_ADMIN_URL", default="admin/")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.gis",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "django_filters",
    "apps.cuentas",
    "apps.flota",
    "apps.convenios",
    "apps.reservas",
    "apps.aeropuerto",
    "apps.auditoria",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# PostgreSQL 16 + PostGIS: DATABASE_URL con esquema postgis://
DATABASES = {"default": env.db("DATABASE_URL")}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Si GDAL/GEOS no están en la ruta estándar del sistema (no aplica en la imagen Docker).
GDAL_LIBRARY_PATH = env("GDAL_LIBRARY_PATH", default=None)
GEOS_LIBRARY_PATH = env("GEOS_LIBRARY_PATH", default=None)

AUTH_USER_MODEL = "cuentas.Usuario"
# RNF: contraseñas con PBKDF2-SHA256.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.PBKDF2PasswordHasher"]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "es-cl"
TIME_ZONE = "America/Santiago"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework_simplejwt.authentication.JWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_THROTTLE_RATES": {"login": env("THROTTLE_LOGIN", default="10/min")},
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
}

# Geocodificador (DC-05): sin clave se usa el de desarrollo (determinístico, sin servicios externos).
GOOGLE_GEOCODING_API_KEY = env("GOOGLE_GEOCODING_API_KEY", default="")

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env.int("JWT_ACCESS_MIN", default=15)),
    "REFRESH_TOKEN_LIFETIME": timedelta(hours=env.int("JWT_REFRESH_HORAS", default=12)),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": False,
    "SIGNING_KEY": SECRET_KEY,
}

# Panel web: el refresh viaja en una cookie httpOnly; el access se guarda solo en memoria.
JWT_COOKIE = {
    "nombre": "refresh_panel",
    "ruta": "/api/auth/",
    "samesite": "Lax",
    "secure": env.bool("JWT_COOKIE_SECURE", default=not DEBUG),
}

# Bloqueo temporal al llegar a 5 intentos fallidos (USUARIO.intentos_fallidos).
LOGIN_MAX_INTENTOS = 5
LOGIN_BLOQUEO = timedelta(minutes=env.int("LOGIN_BLOQUEO_MIN", default=15))

SPECTACULAR_SETTINGS = {
    "TITLE": "FlotaÁgil API",
    "DESCRIPTION": "API de FlotaÁgil: panel web, portal del pasajero y app del conductor.",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    # Nombres estables de los enums en el contrato (y en los tipos TypeScript generados).
    "ENUM_NAME_OVERRIDES": {
        "EstadoViajeEnum": "apps.reservas.models.EstadoViaje",
        "CanalEnum": "apps.reservas.models.Canal",
        "CanalPanelEnum": ["TELEFONO", "WHATSAPP", "CONVENIO"],
    },
}

# Producción (TLS 1.2+ con HSTS en Nginx); se activan por entorno.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=False)
SECURE_HSTS_SECONDS = env.int("DJANGO_SECURE_HSTS_SECONDS", default=0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = SECURE_HSTS_SECONDS > 0
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"consola": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["consola"], "level": env("DJANGO_LOG_LEVEL", default="INFO")},
}
