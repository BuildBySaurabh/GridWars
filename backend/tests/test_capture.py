"""Capture endpoint, snapshot, stats and leaderboard (sequential behaviour)."""
from unittest import mock

import pytest
from django.db import OperationalError

from grid.models import GridCell

pytestmark = pytest.mark.django_db


def capture_url(cell_id) -> str:
    return f"/api/grid/cells/{cell_id}/capture/"


def test_player_can_capture_an_unclaimed_cell(seeded_grid, auth_client, make_player):
    player = make_player("Neo")
    response = auth_client(player).post(capture_url(120))
    assert response.status_code == 200
    body = response.json()
    assert (body["id"], body["row"], body["column"], body["version"]) == (120, 4, 19, 2)
    assert body["owner"] == {"id": str(player.id), "username": "Neo", "color": "#8B5CF6"}
    cell = GridCell.objects.get(pk=120)
    assert cell.owner_id == player.id and cell.captured_at is not None and cell.version == 2


def test_player_cannot_capture_a_cell_they_already_own(seeded_grid, auth_client, make_player):
    client = auth_client(make_player())
    assert client.post(capture_url(10)).status_code == 200
    response = client.post(capture_url(10))
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "cell_already_captured"
    assert GridCell.objects.get(pk=10).version == 2  # not bumped again


def test_another_player_cannot_overwrite_an_owner(seeded_grid, auth_client, make_player):
    owner, rival = make_player("Owner"), make_player("Rival")
    assert auth_client(owner).post(capture_url(33)).status_code == 200
    response = auth_client(rival).post(capture_url(33))
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "cell_already_captured"
    assert error["details"]["cell"]["owner"]["username"] == "Owner"
    cell = GridCell.objects.get(pk=33)
    assert cell.owner_id == owner.id and cell.version == 2


def test_unauthenticated_users_cannot_capture(seeded_grid, anon_client):
    response = anon_client.post(capture_url(1))
    assert response.status_code == 401
    assert GridCell.objects.filter(owner__isnull=False).count() == 0


def test_invalid_token_cannot_capture(seeded_grid, anon_client):
    anon_client.credentials(HTTP_AUTHORIZATION="Bearer garbage")
    assert anon_client.post(capture_url(1)).status_code == 401


@pytest.mark.parametrize(
    ("cell_id", "status", "code"),
    [("0", 404, "cell_not_found"), ("626", 404, "cell_not_found"), ("999999", 404, "cell_not_found"),
     ("abc", 400, "validation_error"), ("-1", 400, "validation_error"), ("1.5", 400, "validation_error"),
     ("99999999999999", 400, "validation_error")],
)
def test_invalid_cell_ids(seeded_grid, auth_client, make_player, cell_id, status, code):
    response = auth_client(make_player()).post(capture_url(cell_id))
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert GridCell.objects.filter(owner__isnull=False).count() == 0


def test_owner_is_taken_from_the_token_never_from_the_request(seeded_grid, auth_client, make_player):
    attacker, victim = make_player("Attacker"), make_player("Victim")
    response = auth_client(attacker).post(
        capture_url(50), {"owner": str(victim.id), "owner_id": str(victim.id), "version": 99}, format="json"
    )
    assert response.status_code == 200
    cell = GridCell.objects.get(pk=50)
    assert cell.owner_id == attacker.id and cell.version == 2


def test_get_capture_is_not_allowed(seeded_grid, auth_client, make_player):
    assert auth_client(make_player()).get(capture_url(1)).status_code == 405


def test_capture_is_rate_limited(seeded_grid, auth_client, make_player, settings):
    settings.GRIDWARS_THROTTLE_RATES = {"join": "100/min", "capture": "2/min"}
    client = auth_client(make_player())
    assert client.post(capture_url(1)).status_code == 200
    assert client.post(capture_url(2)).status_code == 200
    response = client.post(capture_url(3))
    assert response.status_code == 429
    assert GridCell.objects.get(pk=3).owner_id is None


def test_database_errors_do_not_leak_details(seeded_grid, auth_client, make_player):
    with mock.patch("grid.views.capture_cell", side_effect=OperationalError("password=hunter2 host=db.internal")):
        response = auth_client(make_player()).post(capture_url(1))
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "service_unavailable"
    assert "hunter2" not in response.content.decode()


# ------------------------------------------------------------------ read endpoints
def test_grid_snapshot_lists_all_cells_and_reflects_captures(seeded_grid, auth_client, make_player):
    client = auth_client(make_player("Neo"))
    client.post(capture_url(1))
    body = client.get("/api/grid/").json()
    assert len(body["cells"]) == 625 and body["server_time"]
    first = body["cells"][0]
    assert first["id"] == 1 and first["owner"]["username"] == "Neo" and first["version"] == 2
    assert body["cells"][1]["owner"] is None
    assert set(first) == {"id", "row", "column", "owner", "captured_at", "version"}


def test_grid_snapshot_requires_authentication(seeded_grid, anon_client):
    assert anon_client.get("/api/grid/").status_code == 401
    assert anon_client.get("/api/grid/stats/").status_code == 401
    assert anon_client.get("/api/leaderboard/").status_code == 401


def test_stats(seeded_grid, auth_client, make_player):
    client = auth_client(make_player())
    for cell_id in (1, 2, 3, 4):
        client.post(capture_url(cell_id))
    stats = client.get("/api/grid/stats/").json()
    assert stats == {
        "total_cells": 625, "captured_cells": 4, "unclaimed_cells": 621,
        "total_players": 1, "capture_percentage": 0.64,
    }


def test_leaderboard_ranks_players_with_ties(seeded_grid, auth_client, make_player):
    a, b, c, d = (make_player(n) for n in ("Alpha", "Bravo", "Charlie", "Delta"))
    plan = {a: [1, 2, 3], b: [4, 5], c: [6, 7], d: []}  # b and c tie on 2 cells
    for player, cells in plan.items():
        for cell_id in cells:
            assert auth_client(player).post(capture_url(cell_id)).status_code == 200

    entries = auth_client(d).get("/api/leaderboard/").json()["entries"]
    assert [(e["player"]["username"], e["captured_cells"], e["rank"]) for e in entries] == [
        ("Alpha", 3, 1), ("Bravo", 2, 2), ("Charlie", 2, 2),  # tie shares rank, earlier capturer first
    ]
    assert "Delta" not in [e["player"]["username"] for e in entries]  # zero cells are not ranked
    assert auth_client(c).get("/api/players/me/").json()["stats"]["rank"] == 2
    assert auth_client(a).get("/api/leaderboard/?limit=1").json()["entries"][0]["player"]["username"] == "Alpha"
    assert len(auth_client(a).get("/api/leaderboard/?limit=1").json()["entries"]) == 1


# ------------------------------------------------------------------ broadcasting
def test_successful_capture_publishes_events_only_after_commit(
    seeded_grid, auth_client, make_player, django_capture_on_commit_callbacks
):
    player = make_player("Neo")
    with mock.patch("grid.services.events.publish") as publish:
        with django_capture_on_commit_callbacks(execute=False) as callbacks:
            assert auth_client(player).post(capture_url(120)).status_code == 200
        publish.assert_not_called()  # nothing is sent until the transaction commits
        for callback in callbacks:
            callback()

    sent = [call.args[0] for call in publish.call_args_list]
    assert [event["type"] for event in sent] == ["cell.captured", "leaderboard.updated"]
    data = sent[0]["data"]
    assert data["cell_id"] == 120 and data["row"] == 4 and data["column"] == 19 and data["version"] == 2
    assert data["owner"] == {"id": str(player.id), "username": "Neo", "color": "#8B5CF6"}
    assert sent[1]["data"]["entries"][0]["captured_cells"] == 1


def test_failed_capture_publishes_nothing(seeded_grid, auth_client, make_player, django_capture_on_commit_callbacks):
    owner, rival = make_player(), make_player()
    auth_client(owner).post(capture_url(5))
    with mock.patch("grid.services.events.publish") as publish:
        with django_capture_on_commit_callbacks(execute=True):
            assert auth_client(rival).post(capture_url(5)).status_code == 409
            assert auth_client(rival).post(capture_url("nope")).status_code == 400
            assert auth_client(rival).post(capture_url(9999)).status_code == 404
    publish.assert_not_called()


def test_capture_still_succeeds_when_the_channel_layer_is_down(seeded_grid, auth_client, make_player):
    """Redis outage must not fail (or roll back) an already-committed capture."""
    with mock.patch("realtime.events.get_channel_layer", side_effect=ConnectionError("redis down")):
        response = auth_client(make_player()).post(capture_url(77))
    # with the non-transactional test wrapper the callback is deferred; run the publisher directly
    from grid.services import _publish_capture

    with mock.patch("realtime.events.get_channel_layer", side_effect=ConnectionError("redis down")):
        _publish_capture(GridCell.objects.select_related("owner").get(pk=77))  # must not raise
    assert response.status_code == 200
