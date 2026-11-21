"""Local development settings."""
from .base import *  # noqa: F401,F403
from .base import ALLOWED_HOSTS, CORS_ALLOWED_ORIGINS, SECRET_KEY, SIMPLE_JWT, env_bool

DEBUG = env_bool("DEBUG", True)

if not SECRET_KEY:
    # Development-only fallback. Production refuses to start without SECRET_KEY.
    SECRET_KEY = "dev-only-insecure-secret-key-change-me-0123456789abcdef"
    SIMPLE_JWT = {**SIMPLE_JWT, "SIGNING_KEY": SIMPLE_JWT["SIGNING_KEY"] or SECRET_KEY}

if not ALLOWED_HOSTS:
    ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]", "testserver"]

if not CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]
