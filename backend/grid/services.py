"""Business logic for the grid: capture, snapshots, statistics, leaderboard."""
import logging

from django.db import transaction
from django.db.models import Count, F, Min
from django.utils import timezone

from accounts.models import Player
from accounts.serializers import PlayerSerializer
from realtime import events

from .constants import TOTAL_CELLS
from .exceptions import CellAlreadyCaptured, CellNotFound
from .models import GridCell
from .serializers import CellSerializer

logger = logging.getLogger(__name__)


def _percentage(count: int) -> float:
    return round(count * 100 / TOTAL_CELLS, 2)


# --------------------------------------------------------------------------- capture
def capture_cell(*, player: Player, cell_id: int) -> GridCell:
    """Capture an unclaimed cell for ``player``.

    Concurrency model
    -----------------
    1. ``select_for_update()`` takes a row lock on the cell. A competing
       transaction blocks here until we commit, then sees the new owner.
    2. The ownership check runs *after* the lock, so it cannot be stale.
    3. The UPDATE is additionally conditional (``owner IS NULL``) and a database
       trigger forbids reassigning an owned cell, so correctness never depends
       on application code alone.
    4. Real-time events are published via ``on_commit``, i.e. only for changes
       that are durably committed. Failed/rolled-back captures are never sent.

    ``player`` always comes from the verified JWT, never from request data.
    """
    with transaction.atomic():
        try:
            # of=("self",): lock only the cell row. `owner` is nullable, so
            # select_related makes it a LEFT JOIN and PostgreSQL refuses to lock
            # the nullable side of an outer join.
            cell = (
                GridCell.objects.select_for_update(of=("self",))
                .select_related("owner")
                .get(pk=cell_id)
            )
        except GridCell.DoesNotExist:
            raise CellNotFound() from None

        if cell.owner_id is not None:
            raise CellAlreadyCaptured(
                {"cell": CellSerializer(cell).data}
            )

        updated = GridCell.objects.filter(pk=cell.pk, owner__isnull=True).update(
            owner=player,
            captured_at=timezone.now(),
            version=F("version") + 1,
        )
        if updated != 1:  # defensive: should be impossible while the row is locked
            raise CellAlreadyCaptured()

        cell = GridCell.objects.select_related("owner").get(pk=cell.pk)
        transaction.on_commit(lambda: _publish_capture(cell), robust=True)
    return cell


def _publish_capture(cell: GridCell) -> None:
    """Runs after commit. Must never raise: the capture already succeeded."""
    try:
        events.publish(events.cell_captured(cell))
        events.publish(events.leaderboard_updated(get_leaderboard(), get_stats()))
    except Exception:
        logger.exception("Failed to publish capture events for cell %s", cell.pk)


# ----------------------------------------------------------------------- read models
def get_grid_snapshot() -> dict:
    cells = GridCell.objects.select_related("owner").order_by("id")
    return {"cells": cells, "server_time": timezone.now()}


def get_stats() -> dict:
    captured = GridCell.objects.filter(owner__isnull=False).count()
    return {
        "total_cells": TOTAL_CELLS,
        "captured_cells": captured,
        "unclaimed_cells": TOTAL_CELLS - captured,
        "total_players": Player.objects.count(),
        "capture_percentage": _percentage(captured),
    }


def get_leaderboard(limit: int = 10) -> list[dict]:
    """Players ranked by captured cells. Ties share a rank and are ordered by
    who captured their first cell earliest."""
    rows = (
        Player.objects.annotate(captured=Count("cells"), first_capture=Min("cells__captured_at"))
        .filter(captured__gt=0)
        .order_by("-captured", "first_capture", "username")
    )
    entries: list[dict] = []
    previous_count = None
    rank = 0
    for position, player in enumerate(rows[:limit], start=1):
        if player.captured != previous_count:
            rank = position
            previous_count = player.captured
        entries.append(
            {
                "rank": rank,
                "player": PlayerSerializer(player).data,
                "captured_cells": player.captured,
                "capture_percentage": _percentage(player.captured),
            }
        )
    return entries


def get_player_stats(player: Player) -> dict:
    captured = GridCell.objects.filter(owner=player).count()
    rank = None
    if captured:
        ahead = (
            Player.objects.annotate(captured=Count("cells")).filter(captured__gt=captured).count()
        )
        rank = ahead + 1
    return {"captured_cells": captured, "capture_percentage": _percentage(captured), "rank": rank}
