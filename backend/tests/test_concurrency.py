"""Simultaneous captures against real PostgreSQL.

These tests use TransactionTestCase-style (transaction=True) databases and real
threads, each with its own DB connection, so row-level locking is genuinely
exercised. SQLite would not prove anything here.
"""
import threading
from collections import Counter
from unittest import mock

import pytest
from django.db import connection, connections

from grid.exceptions import CellAlreadyCaptured
from grid.models import GridCell
from grid.services import capture_cell

pytestmark = pytest.mark.django_db(transaction=True)


def run_in_threads(jobs):
    """Run callables simultaneously (released together by a barrier). Returns results in order."""
    barrier = threading.Barrier(len(jobs))
    results = [None] * len(jobs)

    def worker(index, job):
        try:
            barrier.wait(timeout=10)
            results[index] = ("ok", job())
        except Exception as exc:  # noqa: BLE001 - collected and asserted on by the tests
            results[index] = ("error", exc)
        finally:
            connections.close_all()  # each thread owns its own connection

    threads = [threading.Thread(target=worker, args=(i, job)) for i, job in enumerate(jobs)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
        assert not thread.is_alive(), "capture deadlocked"
    return results


def test_database_is_postgresql():
    assert connection.vendor == "postgresql"


def test_two_players_racing_for_the_same_cell_only_one_wins(seeded_grid, make_player):
    a, b = make_player("Racer_A"), make_player("Racer_B")
    results = run_in_threads([lambda: capture_cell(player=a, cell_id=150),
                              lambda: capture_cell(player=b, cell_id=150)])

    winners = [r for r in results if r[0] == "ok"]
    losers = [r for r in results if r[0] == "error"]
    assert len(winners) == 1 and len(losers) == 1
    assert isinstance(losers[0][1], CellAlreadyCaptured) and losers[0][1].status_code == 409

    cell = GridCell.objects.get(pk=150)
    assert cell.owner_id == winners[0][1].owner_id  # DB owner == the winner
    assert cell.version == 2  # exactly one successful change


def test_many_players_racing_for_one_cell(seeded_grid, make_player):
    players = [make_player(f"Racer_{i}") for i in range(20)]
    results = run_in_threads([(lambda p=p: capture_cell(player=p, cell_id=300)) for p in players])

    outcomes = Counter(kind for kind, _ in results)
    assert outcomes == {"ok": 1, "error": 19}
    assert all(isinstance(value, CellAlreadyCaptured) for kind, value in results if kind == "error")
    cell = GridCell.objects.get(pk=300)
    assert cell.owner_id in {p.id for p in players} and cell.version == 2
    assert GridCell.objects.filter(owner__isnull=False).count() == 1


def test_same_player_double_click_captures_once(seeded_grid, make_player):
    player = make_player("Doubleclick")
    results = run_in_threads([lambda: capture_cell(player=player, cell_id=11) for _ in range(8)])
    assert Counter(kind for kind, _ in results) == {"ok": 1, "error": 7}
    assert GridCell.objects.get(pk=11).version == 2


def test_players_capturing_different_cells_all_succeed(seeded_grid, make_player):
    players = [make_player(f"Spread_{i}") for i in range(15)]
    results = run_in_threads([(lambda p=p, n=n: capture_cell(player=p, cell_id=n)) for n, p in enumerate(players, 1)])

    assert all(kind == "ok" for kind, _ in results), [r for r in results if r[0] == "error"]
    for number, player in enumerate(players, 1):
        assert GridCell.objects.get(pk=number).owner_id == player.id


def test_contended_burst_each_cell_has_exactly_one_owner(seeded_grid, make_player):
    """30 players each try the same 10 cells, in different orders."""
    players = [make_player(f"Burst_{i}") for i in range(30)]
    cells = list(range(100, 110))

    def attempt(player, offset):
        won = []
        for step in range(len(cells)):
            cell_id = cells[(step + offset) % len(cells)]
            try:
                capture_cell(player=player, cell_id=cell_id)
                won.append(cell_id)
            except CellAlreadyCaptured:
                pass
        return won

    results = run_in_threads([(lambda p=p, i=i: attempt(p, i)) for i, p in enumerate(players)])
    assert all(kind == "ok" for kind, _ in results), [r for r in results if r[0] == "error"]

    all_wins = [cell for _, won in results for cell in won]
    assert sorted(all_wins) == cells  # every cell won exactly once, none twice
    for cell in GridCell.objects.filter(pk__in=cells):
        assert cell.owner_id is not None and cell.version == 2


def test_only_the_winning_capture_is_published(seeded_grid, make_player):
    a, b = make_player("Pub_A"), make_player("Pub_B")
    with mock.patch("grid.services.events.publish") as publish:
        results = run_in_threads([lambda: capture_cell(player=a, cell_id=200),
                                  lambda: capture_cell(player=b, cell_id=200)])
    assert Counter(kind for kind, _ in results) == {"ok": 1, "error": 1}

    captured = [c.args[0] for c in publish.call_args_list if c.args[0]["type"] == "cell.captured"]
    assert len(captured) == 1
    winner = next(value for kind, value in results if kind == "ok")
    assert captured[0]["data"]["owner"]["id"] == str(winner.owner_id)
    assert captured[0]["data"]["version"] == 2


def test_rolled_back_capture_is_never_published(seeded_grid, make_player):
    """If the surrounding transaction fails after capture_cell, nothing is broadcast."""
    from django.db import transaction

    player = make_player("Rollback")
    with mock.patch("grid.services.events.publish") as publish:
        with pytest.raises(RuntimeError), transaction.atomic():
            capture_cell(player=player, cell_id=400)
            raise RuntimeError("something later in the request failed")
    publish.assert_not_called()
    assert GridCell.objects.get(pk=400).owner_id is None


def test_losing_request_over_http_returns_409(seeded_grid, make_player, auth_client):
    """Same race through the real REST stack: one 200, the rest 409."""
    players = [make_player(f"Http_{i}") for i in range(10)]
    clients = [auth_client(p) for p in players]
    results = run_in_threads([(lambda c=c: c.post("/api/grid/cells/150/capture/").status_code) for c in clients])
    statuses = Counter(value for _, value in results)
    assert statuses == {200: 1, 409: 9}
    assert GridCell.objects.get(pk=150).version == 2
