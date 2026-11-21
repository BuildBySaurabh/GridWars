"""Online-player tracking.

Each socket registers ``"<player_id>|<channel_name>"`` with a heartbeat
timestamp. Entries older than PRESENCE_TTL_SECONDS are ignored, so sockets lost
in a crash expire on their own. The number of *distinct players* is reported
(one player with two tabs counts once).

Redis is used when REDIS_URL is configured so the count is correct across
server processes; otherwise a process-local dict is used (dev/tests).
All operations fail soft: presence is informational, never critical.
"""
import asyncio
import logging
import time

from django.conf import settings

logger = logging.getLogger(__name__)

_KEY = "gridwars:presence"


def member_id(player_id, channel_name: str) -> str:
    return f"{player_id}|{channel_name}"


def _distinct_players(members) -> int:
    return len({m.split("|", 1)[0] for m in members})


class MemoryPresence:
    def __init__(self) -> None:
        self._members: dict[str, float] = {}

    async def touch(self, member: str) -> None:
        self._members[member] = time.time()

    async def remove(self, member: str) -> None:
        self._members.pop(member, None)

    async def count(self) -> int:
        cutoff = time.time() - settings.PRESENCE_TTL_SECONDS
        self._members = {m: ts for m, ts in self._members.items() if ts >= cutoff}
        return _distinct_players(self._members)

    def reset(self) -> None:
        self._members.clear()


class RedisPresence:
    def __init__(self, url: str) -> None:
        self._url = url
        self._clients: dict[int, object] = {}  # one client per event loop

    def _client(self):
        import redis.asyncio as aioredis

        loop_id = id(asyncio.get_running_loop())
        if loop_id not in self._clients:
            self._clients[loop_id] = aioredis.from_url(self._url, decode_responses=True)
        return self._clients[loop_id]

    async def touch(self, member: str) -> None:
        await self._client().zadd(_KEY, {member: time.time()})

    async def remove(self, member: str) -> None:
        await self._client().zrem(_KEY, member)

    async def count(self) -> int:
        client = self._client()
        await client.zremrangebyscore(_KEY, "-inf", time.time() - settings.PRESENCE_TTL_SECONDS)
        return _distinct_players(await client.zrange(_KEY, 0, -1))


_backend = None
_last_known = 0


def _get_backend():
    global _backend
    if _backend is None:
        url = getattr(settings, "REDIS_URL", "")
        _backend = RedisPresence(url) if url else MemoryPresence()
    return _backend


async def touch(member: str) -> None:
    try:
        await _get_backend().touch(member)
    except Exception:
        logger.warning("Presence touch failed", exc_info=True)


async def remove(member: str) -> None:
    try:
        await _get_backend().remove(member)
    except Exception:
        logger.warning("Presence remove failed", exc_info=True)


async def count() -> int:
    """Number of distinct online players; last known value if the backend fails."""
    global _last_known
    try:
        _last_known = await _get_backend().count()
    except Exception:
        logger.warning("Presence count failed; using last known value", exc_info=True)
    return _last_known


def reset() -> None:
    """Test helper: forget every in-memory member."""
    global _backend, _last_known
    _backend = None
    _last_known = 0
