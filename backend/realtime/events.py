"""WebSocket event contract and publishing.

Every event sent to clients has the envelope ``{"type": str, "data": object}``.

Server -> client types:
    connection.ready     sent once after successful authentication
    cell.captured        a cell changed owner (carries ``version``)
    leaderboard.updated  top players + totals after a capture
    presence.updated     number of online players changed
    pong                 reply to a client ``ping``
    error                protocol/auth error (``code``, ``message``)
"""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)

GRID_GROUP = "grid"

CELL_CAPTURED = "cell.captured"
LEADERBOARD_UPDATED = "leaderboard.updated"
PRESENCE_UPDATED = "presence.updated"
CONNECTION_READY = "connection.ready"
PONG = "pong"
ERROR = "error"


def owner_payload(player) -> dict:
    return {"id": str(player.id), "username": player.username, "color": player.color}


def cell_captured(cell) -> dict:
    return {
        "type": CELL_CAPTURED,
        "data": {
            "cell_id": cell.id,
            "row": cell.row,
            "column": cell.column,
            "owner": owner_payload(cell.owner),
            "captured_at": cell.captured_at.isoformat(),
            "version": cell.version,
        },
    }


def leaderboard_updated(entries: list[dict], stats: dict) -> dict:
    return {"type": LEADERBOARD_UPDATED, "data": {"entries": entries, "stats": stats}}


def presence_updated(online_players: int) -> dict:
    return {"type": PRESENCE_UPDATED, "data": {"online_players": online_players}}


def publish(event: dict) -> None:
    """Broadcast ``event`` to every authenticated socket (sync callers).

    A broken channel layer (e.g. Redis down) is logged and swallowed: the
    database change it describes is already committed, and clients recover by
    refetching a snapshot when they reconnect.
    """
    layer = get_channel_layer()
    if layer is None:
        return
    try:
        async_to_sync(layer.group_send)(GRID_GROUP, {"type": "grid.event", "event": event})
    except Exception:
        logger.exception("Failed to publish %s event", event.get("type"))
