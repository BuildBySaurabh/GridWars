"""Guest join, validation, authentication, throttling, health."""
import pytest

from accounts.models import Player

pytestmark = pytest.mark.django_db

JOIN = "/api/players/join/"


def test_guest_player_can_join(anon_client):
    response = anon_client.post(JOIN, {"username": "Saurabh", "color": "#8b5cf6"}, format="json")
    assert response.status_code == 201
    body = response.json()
    assert body["token"] and body["token_type"] == "Bearer" and body["expires_in"] > 0
    assert body["player"]["username"] == "Saurabh"
    assert body["player"]["color"] == "#8B5CF6"  # normalised
    assert set(body["player"]) == {"id", "username", "color"}  # no internal fields leaked
    assert Player.objects.count() == 1


@pytest.mark.parametrize(
    "username",
    ["", "ab", "a" * 21, "has space", "-leading", "emoji😀name", "admin", "GridWars", "fuck_you", "sh1t", "Dick"],
)
def test_invalid_usernames_are_rejected(anon_client, username):
    response = anon_client.post(JOIN, {"username": username, "color": "#22D3EE"}, format="json")
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert "username" in error["details"]
    assert Player.objects.count() == 0


@pytest.mark.parametrize("username", ["Dickens", "Peacock", "player_1", "A-B-C", "Zed99"])
def test_ordinary_usernames_are_accepted(anon_client, username):
    assert anon_client.post(JOIN, {"username": username, "color": "#22D3EE"}, format="json").status_code == 201


@pytest.mark.parametrize("color", ["red", "#12345", "#GGGGGG", "8B5CF6", "#000000", "#0a0a0a"])
def test_invalid_or_invisible_colors_are_rejected(anon_client, color):
    response = anon_client.post(JOIN, {"username": "Valid_Name", "color": color}, format="json")
    assert response.status_code == 400
    assert "color" in response.json()["error"]["details"]


def test_missing_fields_are_rejected(anon_client):
    response = anon_client.post(JOIN, {}, format="json")
    assert response.status_code == 400
    assert set(response.json()["error"]["details"]) == {"username", "color"}


def test_duplicate_username_is_case_insensitive(anon_client):
    assert anon_client.post(JOIN, {"username": "Neo", "color": "#22D3EE"}, format="json").status_code == 201
    response = anon_client.post(JOIN, {"username": "nEO", "color": "#F472B6"}, format="json")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "username_taken"
    assert Player.objects.count() == 1


def test_join_ignores_a_stale_authorization_header(anon_client):
    anon_client.credentials(HTTP_AUTHORIZATION="Bearer not-a-real-token")
    assert anon_client.post(JOIN, {"username": "Fresh", "color": "#22D3EE"}, format="json").status_code == 201


def test_join_is_rate_limited(anon_client, settings):
    settings.GRIDWARS_THROTTLE_RATES = {"join": "2/min", "capture": "1000/min"}
    for name in ("one_1", "two_2"):
        assert anon_client.post(JOIN, {"username": name, "color": "#22D3EE"}, format="json").status_code == 201
    response = anon_client.post(JOIN, {"username": "three_3", "color": "#22D3EE"}, format="json")
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "throttled"


def test_me_requires_authentication(anon_client):
    response = anon_client.get("/api/players/me/")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


def test_me_returns_player_and_stats(auth_client, make_player):
    player = make_player("Trinity")
    response = auth_client(player).get("/api/players/me/")
    assert response.status_code == 200
    body = response.json()
    assert body["player"]["id"] == str(player.id)
    assert body["stats"] == {"captured_cells": 0, "capture_percentage": 0.0, "rank": None}


def test_tampered_token_is_rejected(anon_client, token_for, make_player):
    token = token_for(make_player())
    anon_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token[:-4]}AAAA")
    assert anon_client.get("/api/players/me/").status_code == 401


def test_token_for_deleted_player_is_rejected(anon_client, token_for, make_player):
    player = make_player()
    token = token_for(player)
    player.delete()
    anon_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    assert anon_client.get("/api/players/me/").status_code == 401


def test_health_endpoint(anon_client):
    response = anon_client.get("/api/health/")
    assert response.status_code == 200
    assert response.json()["database"] == "ok"


def test_unknown_url_returns_json_404(anon_client):
    response = anon_client.get("/api/nope/")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_openapi_schema_is_served(anon_client):
    response = anon_client.get("/api/schema/")
    assert response.status_code == 200
    assert b"/api/grid/cells/{cell_id}/capture/" in response.content
