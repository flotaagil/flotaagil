from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def salud(_request):
    """Comprobación de vida para el monitoreo (UptimeRobot)."""
    return JsonResponse({"estado": "ok"})


urlpatterns = [
    path(settings.ADMIN_URL, admin.site.urls),
    path("api/salud/", salud, name="salud"),
    path("api/auth/", include("apps.cuentas.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
]

if settings.DEBUG:
    urlpatterns += [path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs")]
