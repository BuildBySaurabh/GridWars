from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from .health import health

handler404 = "config.exceptions.json_404"
handler500 = "config.exceptions.json_500"

urlpatterns = [
    path("api/health/", health, name="health"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("api/players/", include("accounts.urls")),
    path("api/", include("grid.urls")),
]
