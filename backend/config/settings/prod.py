"""Production settings. Fails fast when required configuration is missing."""
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .base import ALLOWED_HOSTS, CORS_ALLOWED_ORIGINS, REDIS_URL, SECRET_KEY, env, env_bool, env_int

DEBUG = False

_missing = [
    name
    for name, value in {
        "SECRET_KEY": SECRET_KEY,
        "ALLOWED_HOSTS": ALLOWED_HOSTS,
        "CORS_ALLOWED_ORIGINS": CORS_ALLOWED_ORIGINS,
        "DATABASE_URL": env("DATABASE_URL"),
        "REDIS_URL": REDIS_URL,
    }.items()
    if not value
]
if _missing:
    raise ImproperlyConfigured(f"Missing required environment variables: {', '.join(_missing)}")
if len(SECRET_KEY) < 32:
    raise ImproperlyConfigured("SECRET_KEY must be at least 32 characters long.")

# TLS is normally terminated by the hosting platform's proxy.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
SECURE_REDIRECT_EXEMPT = [r"^api/health/$"]  # platform health checks may use plain HTTP
SECURE_HSTS_SECONDS = env_int("SECURE_HSTS_SECONDS", 0)  # raise once HTTPS is verified
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# security.W003 (CSRF middleware) is intentionally silenced: this API has no
# cookies or sessions. Authentication is a bearer JWT in the Authorization
# header, which a cross-site request cannot attach, so there is no CSRF surface.
# security.W004 (HSTS) is NOT silenced: set SECURE_HSTS_SECONDS once HTTPS works.
SILENCED_SYSTEM_CHECKS = ["security.W003"]
