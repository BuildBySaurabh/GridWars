"""ASGI entrypoint: HTTP -> Django, WebSocket -> Channels. Served by Daphne."""
import os

from django.core.asgi import get_asgi_application

# Safe by default: production settings (they refuse to start with missing config).
# For local development use `manage.py runserver`, or export DJANGO_SETTINGS_MODULE=config.settings.dev.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")

# Initialise Django before importing anything that touches models.
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402

from realtime.middleware import OriginAllowlistMiddleware  # noqa: E402
from realtime.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": OriginAllowlistMiddleware(URLRouter(websocket_urlpatterns)),
    }
)
