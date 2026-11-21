"""Test settings: real PostgreSQL (needed for locking tests), in-memory channel layer."""
from .dev import *  # noqa: F401,F403

DEBUG = False

# Persistent connections (conn_max_age=60) are right for production, but in tests they
# leave Channels' DB worker-thread connection open and block test-database teardown.
DATABASES["default"]["CONN_MAX_AGE"] = 0  # noqa: F405

CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
REDIS_URL = ""

# High limits so ordinary tests are never throttled; throttle tests override these.
GRIDWARS_THROTTLE_RATES = {"join": "1000/min", "capture": "10000/min"}

WS_AUTH_TIMEOUT_SECONDS = 1
PRESENCE_TTL_SECONDS = 75
