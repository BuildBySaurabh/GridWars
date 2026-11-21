"""WebSocket authentication, broadcasting and protocol handling."""
import json

import pytest
from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator
from rest_framework.test import APIClient

from accounts.services import create_guest_player, issue_access_token
from config.asgi import application
from grid.services import capture_cell

pytestmark = [pytest.mark.django_db(transaction=True), pytest.mark.asyncio]


def communicator(origin: str | None = None) -> WebsocketCommunicator:
    headers = [(b"origin", origin.encode())] if origin else []
    return WebsocketCommunicator(application, "/ws/grid/", headers=headers)


async def connect_authenticated(player) -> WebsocketCommunicator:
    ws = communicator()
    connected, _ = await ws.connect()
    assert connected
    token = issue_access_token(player)[0]
    await ws.send_json_to({"type": "auth", "token": token})
    ready = await ws.receive_json_from()
    assert ready["type"] == "connection.ready"
    # The server also broadcasts presence.updated to the whole group, including
    # this socket; consume it so tests start from a quiet connection.
    await drain(ws)
    return ws


async def drain(ws, kinds: set[str] | None = None, limit: int = 10) -> list[dict]:
    """Collect pending messages (optionally filtered by type) until quiet."""
    seen = []
    for _ in range(limit):
        if await ws.receive_nothing(timeout=0.2):
            break
        message = await ws.receive_json_from()
        if kinds is None or message["type"] in kinds:
            seen.append(message)
    return seen


@pytest.fixture
async def player(seeded_grid_async):
    return await sync_to_async(create_guest_player)(username="Neo", color="#22D3EE")


@pytest.fixture
async def seeded_grid_async():
    from django.core.management import call_command

    await sync_to_async(call_command)("seed_grid", verbosity=0)


# ----------------------------------------------------------------------- auth
async def test_valid_token_authenticates(player):
    ws = communicator()
    assert (await ws.connect())[0]
    await ws.send_json_to({"type": "auth", "token": issue_access_token(player)[0]})
    ready = await ws.receive_json_from()
    assert ready["type"] == "connection.ready"
    assert ready["data"]["player"]["username"] == "Neo"
    assert ready["data"]["online_players"] == 1
    await ws.disconnect()


@pytest.mark.parametrize("token", ["garbage", "", None, 123, "a" * 2100])  # 2100 > MAX_TOKEN_LENGTH, < message cap
async def test_invalid_token_is_rejected_and_closed(player, token):
    ws = communicator()
    await ws.connect()
    await ws.send_json_to({"type": "auth", "token": token})
    error = await ws.receive_json_from()
    assert error["type"] == "error" and error["data"]["code"] == "invalid_token"
    assert (await ws.receive_output())["type"] == "websocket.close"


async def test_token_for_unknown_player_is_rejected(player):
    token = issue_access_token(player)[0]
    await sync_to_async(player.delete)()
    ws = communicator()
    await ws.connect()
    await ws.send_json_to({"type": "auth", "token": token})
    assert (await ws.receive_json_from())["data"]["code"] == "invalid_token"


async def test_token_in_query_string_does_not_authenticate(player):
    token = issue_access_token(player)[0]
    ws = WebsocketCommunicator(application, f"/ws/grid/?token={token}")
    await ws.connect()
    # A valid token in the URL is ignored: no connection.ready is sent unprompted...
    assert await ws.receive_nothing(timeout=0.2)
    # ...and the socket still demands an explicit auth message.
    await ws.send_json_to({"type": "ping"})
    error = await ws.receive_json_from()
    assert error["data"]["code"] == "not_authenticated"


async def test_unauthenticated_socket_receives_no_broadcasts(player):
    lurker = communicator()
    await lurker.connect()
    owner = await connect_authenticated(player)

    other = await sync_to_async(create_guest_player)(username="Trinity", color="#F472B6")
    await sync_to_async(capture_cell)(player=other, cell_id=1)

    assert await lurker.receive_nothing(timeout=0.5)
    assert any(m["type"] == "cell.captured" for m in await drain(owner))
    await lurker.disconnect()
    await owner.disconnect()


async def test_auth_timeout_closes_the_socket():
    ws = communicator()
    await ws.connect()  # test settings: WS_AUTH_TIMEOUT_SECONDS = 1
    error = await ws.receive_json_from(timeout=3)
    assert error["data"]["code"] == "auth_timeout"
    assert (await ws.receive_output())["type"] == "websocket.close"


async def test_non_auth_first_message_is_rejected(player):
    ws = communicator()
    await ws.connect()
    await ws.send_json_to({"type": "ping"})
    assert (await ws.receive_json_from())["data"]["code"] == "not_authenticated"
    assert (await ws.receive_output())["type"] == "websocket.close"


async def test_disallowed_origin_is_refused(player, settings):
    from realtime.middleware import OriginAllowlistMiddleware
    from realtime.routing import websocket_urlpatterns
    from channels.routing import URLRouter

    app = OriginAllowlistMiddleware(URLRouter(websocket_urlpatterns))
    ws = WebsocketCommunicator(app, "/ws/grid/", headers=[(b"origin", b"https://evil.example")])
    connected, _ = await ws.connect()
    assert not connected
    ok = WebsocketCommunicator(app, "/ws/grid/", headers=[(b"origin", b"http://localhost:5173")])
    assert (await ok.connect())[0]
    await ok.disconnect()


# ------------------------------------------------------------------- protocol
async def test_malformed_messages(player):
    ws = await connect_authenticated(player)
    await ws.send_to(text_data="{not json")
    assert (await ws.receive_json_from())["data"]["code"] == "malformed_message"
    await ws.send_to(text_data=json.dumps([1, 2, 3]))
    assert (await ws.receive_json_from())["data"]["code"] == "malformed_message"
    await ws.send_to(text_data=json.dumps({"type": "capture", "cell_id": 1}))
    assert (await ws.receive_json_from())["data"]["code"] == "unknown_message_type"
    await ws.send_to(text_data=json.dumps({"no": "type"}))  # third malformed -> closed
    assert (await ws.receive_json_from())["data"]["code"] == "malformed_message"
    assert (await ws.receive_output())["type"] == "websocket.close"


async def test_oversized_message_closes_connection(player):
    ws = await connect_authenticated(player)
    await ws.send_to(text_data=json.dumps({"type": "ping", "pad": "x" * 10_000}))
    assert (await ws.receive_json_from())["data"]["code"] == "message_too_large"
    assert (await ws.receive_output())["type"] == "websocket.close"


async def test_clients_cannot_capture_cells_over_the_socket(player):
    ws = await connect_authenticated(player)
    await ws.send_json_to({"type": "cell.captured", "data": {"cell_id": 1, "owner": {"id": "x"}}})
    assert (await ws.receive_json_from())["data"]["code"] == "unknown_message_type"
    from grid.models import GridCell

    assert await sync_to_async(GridCell.objects.filter(owner__isnull=False).count)() == 0
    await ws.disconnect()


async def test_ping_returns_pong_with_online_count(player):
    ws = await connect_authenticated(player)
    await ws.send_json_to({"type": "ping"})
    pong = await ws.receive_json_from()
    assert pong["type"] == "pong" and pong["data"]["online_players"] == 1
    await ws.disconnect()


# ----------------------------------------------------------------- broadcasting
async def test_clients_receive_capture_events_over_rest(player):
    """End to end: REST capture -> commit -> Channels group -> every socket."""
    viewer_player = await sync_to_async(create_guest_player)(username="Morpheus", color="#34D399")
    actor_ws = await connect_authenticated(player)
    viewer_ws = await connect_authenticated(viewer_player)

    def do_capture():
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_access_token(player)[0]}")
        return client.post("/api/grid/cells/120/capture/")

    response = await sync_to_async(do_capture)()
    assert response.status_code == 200

    for ws in (actor_ws, viewer_ws):
        captured = (await drain(ws, {"cell.captured"}))
        assert len(captured) == 1
        data = captured[0]["data"]
        assert data["cell_id"] == 120 and data["row"] == 4 and data["column"] == 19
        assert data["owner"] == {"id": str(player.id), "username": "Neo", "color": "#22D3EE"}
        assert data["version"] == 2 and data["captured_at"]
        await ws.disconnect()


async def test_leaderboard_update_is_broadcast(player):
    ws = await connect_authenticated(player)
    await sync_to_async(capture_cell)(player=player, cell_id=3)
    updates = await drain(ws, {"leaderboard.updated"})
    assert len(updates) == 1
    data = updates[0]["data"]
    assert data["entries"][0]["player"]["username"] == "Neo" and data["entries"][0]["captured_cells"] == 1
    assert data["stats"]["captured_cells"] == 1 and data["stats"]["unclaimed_cells"] == 624
    await ws.disconnect()


async def test_failed_captures_are_not_broadcast(player):
    rival = await sync_to_async(create_guest_player)(username="Smith", color="#F59E0B")
    await sync_to_async(capture_cell)(player=player, cell_id=9)
    ws = await connect_authenticated(rival)
    await drain(ws)  # discard anything emitted while connecting

    def rival_attempts():
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_access_token(rival)[0]}")
        return [client.post("/api/grid/cells/9/capture/").status_code,
                client.post("/api/grid/cells/0/capture/").status_code,
                client.post("/api/grid/cells/abc/capture/").status_code]

    assert await sync_to_async(rival_attempts)() == [409, 404, 400]
    assert await drain(ws, {"cell.captured", "leaderboard.updated"}) == []
    await ws.disconnect()


async def test_presence_counts_distinct_players_and_updates_on_disconnect(player):
    other = await sync_to_async(create_guest_player)(username="Cypher", color="#A78BFA")
    first = await connect_authenticated(player)
    second_tab = await connect_authenticated(player)  # same player, second tab
    third = await connect_authenticated(other)

    await drain(first)
    await first.send_json_to({"type": "ping"})
    pong = (await drain(first, {"pong"}))[0]
    assert pong["data"]["online_players"] == 2  # two distinct players, three sockets

    await third.disconnect()
    updates = await drain(first, {"presence.updated"})
    assert updates and updates[-1]["data"]["online_players"] == 1
    await first.disconnect()
    await second_tab.disconnect()


async def test_disconnect_without_authenticating_is_clean():
    ws = communicator()
    await ws.connect()
    await ws.disconnect()  # must not raise


async def test_channel_layer_failure_during_auth_closes_with_1013(player, monkeypatch):
    from channels.layers import InMemoryChannelLayer

    async def boom(self, *args, **kwargs):
        raise ConnectionError("redis down")

    monkeypatch.setattr(InMemoryChannelLayer, "group_add", boom)
    ws = communicator()
    await ws.connect()
    await ws.send_json_to({"type": "auth", "token": issue_access_token(player)[0]})
    assert (await ws.receive_json_from())["data"]["code"] == "service_unavailable"
    close = await ws.receive_output()
    assert close["type"] == "websocket.close" and close["code"] == 1013
