from rest_framework.routers import SimpleRouter

from .views import ViajeViewSet

router = SimpleRouter()
router.register("viajes", ViajeViewSet, basename="viaje")

urlpatterns = router.urls
