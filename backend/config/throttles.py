"""Rate limiting that reads its rates at request time and fails open.

Failing open means a Redis/cache outage degrades rate limiting instead of
taking the whole game down.
"""
import logging

from django.conf import settings
from rest_framework.throttling import SimpleRateThrottle

logger = logging.getLogger(__name__)


class _FailOpenThrottle(SimpleRateThrottle):
    def get_rate(self):
        return settings.GRIDWARS_THROTTLE_RATES[self.scope]

    def allow_request(self, request, view):
        try:
            return super().allow_request(request, view)
        except Exception:  # cache backend unavailable
            logger.warning("Throttle backend unavailable; allowing request", exc_info=True)
            return True


class JoinRateThrottle(_FailOpenThrottle):
    """Limits guest creation per client IP."""

    scope = "join"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class CaptureRateThrottle(_FailOpenThrottle):
    """Limits capture attempts per authenticated player."""

    scope = "capture"

    def get_cache_key(self, request, view):
        ident = request.user.pk if request.user and request.user.is_authenticated else self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}
