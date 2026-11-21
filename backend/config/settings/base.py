"""Settings shared by every environment. Configuration comes from env vars."""
import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env")


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    return int(value) if value not in (None, "") else default


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in env(name, default).split(",") if item.strip()]


SECRET_KEY = env("SECRET_KEY")
DEBUG = env_bool("DEBUG", False)
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS")

INSTALLED_APPS = [
    "daphne",  # must come first so `runserver` serves ASGI
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "drf_spectacular",
    "channels",
    "accounts",
    "grid",
    "realtime",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    }
]

AUTH_USER_MODEL = "accounts.Player"

# --- Database: PostgreSQL is the source of truth for cell ownership ---------
DATABASES = {
    "default": dj_database_url.config(
        env="DATABASE_URL",
        default="postgres://gridwars:gridwars@127.0.0.1:5433/gridwars",
        conn_max_age=60,
        conn_health_checks=True,
    )
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Redis: channel layer (real-time fan-out) + shared cache (throttling) ---
REDIS_URL = env("REDIS_URL")

if REDIS_URL:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [REDIS_URL], "capacity": 1000, "expiry": 10},
        }
    }
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
        }
    }
else:
    # Local development / tests only. Not shared between processes.
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# --- CORS -------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")

# --- REST framework ---------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "EXCEPTION_HANDLER": "config.exceptions.api_exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    # Number of reverse proxies in front of the app (used to read the client IP
    # for throttling). 0 = trust REMOTE_ADDR only.
    "NUM_PROXIES": env_int("NUM_PROXIES", 0),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "GridWars API",
    "DESCRIPTION": (
        "REST API for the GridWars real-time shared grid. Cell captures are "
        "announced to connected clients over WebSocket at /ws/grid/."
    ),
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# --- JWT --------------------------------------------------------------------
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env_int("JWT_ACCESS_TOKEN_LIFETIME_MINUTES", 60 * 24 * 7)),
    "ALGORITHM": env("JWT_ALGORITHM", "HS256"),
    "SIGNING_KEY": env("JWT_SIGNING_KEY") or SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# --- Throttling (shared via the cache, i.e. Redis in production) -------------
GRIDWARS_THROTTLE_RATES = {
    "join": env("THROTTLE_JOIN_RATE", "20/min"),
    "capture": env("THROTTLE_CAPTURE_RATE", "120/min"),
}

# --- Real-time --------------------------------------------------------------
WS_AUTH_TIMEOUT_SECONDS = env_int("WS_AUTH_TIMEOUT_SECONDS", 5)
WS_MAX_MESSAGE_BYTES = env_int("WS_MAX_MESSAGE_BYTES", 4096)
PRESENCE_TTL_SECONDS = env_int("PRESENCE_TTL_SECONDS", 75)

# --- Misc -------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"simple": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "simple"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", "INFO")},
}
