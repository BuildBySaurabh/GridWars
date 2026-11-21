#!/usr/bin/env sh
# Production entrypoint: migrate, make sure the 625 cells exist, then serve ASGI (HTTP + WebSocket).
# Both steps are idempotent, so this is safe to run on every deploy/restart.
set -eu

export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.prod}"

python manage.py migrate --noinput
python manage.py seed_grid

# $PORT is injected by most platforms; default 8000 for plain Docker.
exec daphne -b 0.0.0.0 -p "${PORT:-8000}" --proxy-headers config.asgi:application
