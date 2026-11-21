import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET

logger = logging.getLogger(__name__)


@require_GET
def health(request):
    """Liveness/readiness probe. 503 only when the database is unreachable;
    a degraded channel layer (Redis) still serves REST traffic."""
    body = {"status": "ok", "database": "ok", "channel_layer": "ok"}
    status_code = 200

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception:
        logger.exception("Health check: database unavailable")
        body.update(status="unavailable", database="unavailable")
        status_code = 503

    try:
        layer = get_channel_layer()
        async_to_sync(layer.group_send)("health-check", {"type": "health.ping"})
    except Exception:
        logger.warning("Health check: channel layer unavailable", exc_info=True)
        body["channel_layer"] = "unavailable"
        if status_code == 200:
            body["status"] = "degraded"

    return JsonResponse(body, status=status_code)
