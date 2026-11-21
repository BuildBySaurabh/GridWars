from channels.security.websocket import OriginValidator
from django.conf import settings


class OriginAllowlistMiddleware(OriginValidator):
    """Reject browser connections from origins outside CORS_ALLOWED_ORIGINS.

    Channels' stock validator also rejects connections with *no* Origin header.
    Browsers always send one; non-browser clients (health tools, scripts) don't.
    Because authentication is an explicit token message (no cookies / ambient
    credentials), accepting a missing Origin does not enable cross-site abuse.
    """

    def __init__(self, application):
        super().__init__(application, list(settings.CORS_ALLOWED_ORIGINS))

    def valid_origin(self, parsed_origin):
        if parsed_origin is None:
            return True
        return self.validate_origin(parsed_origin)
