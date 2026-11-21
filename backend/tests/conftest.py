import itertools

import pytest
from django.core.cache import cache
from django.core.management import call_command
from rest_framework.test import APIClient

from accounts.services import create_guest_player, issue_access_token
from realtime import presence


@pytest.fixture(scope="session", autouse=True)
def _release_worker_thread_connections(django_db_setup, django_db_blocker):
    """Async tests run DB work on asgiref worker threads that keep their own
    connections open. Terminate those idle sessions before pytest-django drops
    the test database, otherwise teardown warns "database is being accessed by
    other users". Depends on django_db_setup, so it tears down first."""
    yield
    from django.db import connection

    with django_db_blocker.unblock(), connection.cursor() as cursor:
        cursor.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = current_database() AND pid <> pg_backend_pid()"
        )


@pytest.fixture(autouse=True)
def _clean_shared_state():
    """Throttle counters (cache) and in-memory presence must not leak between tests."""
    cache.clear()
    presence.reset()
    yield
    cache.clear()
    presence.reset()


@pytest.fixture
def seeded_grid(db):
    call_command("seed_grid", verbosity=0)


@pytest.fixture
def make_player(db):
    counter = itertools.count(1)

    def _make(username: str | None = None, color: str = "#8B5CF6"):
        return create_guest_player(username=username or f"player{next(counter)}", color=color)

    return _make


@pytest.fixture
def token_for():
    return lambda player: issue_access_token(player)[0]


@pytest.fixture
def auth_client(token_for):
    def _client(player) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_for(player)}")
        return client

    return _client


@pytest.fixture
def anon_client() -> APIClient:
    return APIClient()
