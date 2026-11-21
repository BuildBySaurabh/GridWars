"""The /ws/grid/ WebSocket.

Protocol
--------
1. Client connects. The socket is accepted but is NOT in any broadcast group.
2. Client must send ``{"type": "auth", "token": "<jwt>"}`` within
   WS_AUTH_TIMEOUT_SECONDS (token is never put in the URL).
3. On success the socket joins the grid group and receives ``connection.ready``.
4. The client may send ``{"type": "ping"}`` as a heartbeat; nothing else.

The socket is receive-only for game state: captures happen over REST, so a
client can never claim a cell (or an owner) through this channel.

Close codes: 4400 malformed/oversized, 4401 authentication failed/timeout,
1013 server temporarily unable (channel layer down).
"""
import asyncio
import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings
from django.utils import timezone
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from accounts.models import Player

from . import events, presence

logger = logging.getLogger(__name__)

MAX_MALFORMED = 3
MAX_TOKEN_LENGTH = 2048


class GridConsumer(AsyncWebsocketConsumer):
    player: Player | None = None
    authenticated = False
    _auth_task: asyncio.Task | None = None
    _member: str | None = None
    _malformed = 0

    # -------------------------------------------------------------- lifecycle
    async def connect(self):
        await self.accept()
        self._auth_task = asyncio.create_task(self._auth_deadline())

    async def disconnect(self, code):
        if self._auth_task:
            self._auth_task.cancel()
        if not self.authenticated:
            return
        self.authenticated = False
        try:
            await self.channel_layer.group_discard(events.GRID_GROUP, self.channel_name)
        except Exception:
            logger.warning("group_discard failed", exc_info=True)
        if self._member:
            await presence.remove(self._member)
            await self._broadcast_presence()
        await self._touch_last_seen()

    async def _auth_deadline(self):
        try:
            await asyncio.sleep(settings.WS_AUTH_TIMEOUT_SECONDS)
        except asyncio.CancelledError:
            return
        if not self.authenticated:
            await self._reject("auth_timeout", "Authentication required.", 4401)

    # --------------------------------------------------------------- inbound
    async def receive(self, text_data=None, bytes_data=None):
        if text_data is None:
            return await self._malformed_message("Binary frames are not supported.")
        if len(text_data.encode("utf-8")) > settings.WS_MAX_MESSAGE_BYTES:
            return await self._reject("message_too_large", "Message too large.", 4400)
        try:
            message = json.loads(text_data)
        except json.JSONDecodeError:
            return await self._malformed_message("Message is not valid JSON.")
        if not isinstance(message, dict) or not isinstance(message.get("type"), str):
            return await self._malformed_message("Message must be an object with a string 'type'.")

        kind = message["type"]
        if not self.authenticated:
            if kind != "auth":
                return await self._reject("not_authenticated", "Authenticate first.", 4401)
            return await self._handle_auth(message)
        if kind == "ping":
            return await self._handle_ping()
        if kind == "auth":
            return await self._send_error("already_authenticated", "Already authenticated.")
        await self._send_error("unknown_message_type", f"Unknown message type '{kind[:32]}'.")

    async def _handle_auth(self, message: dict):
        token = message.get("token")
        if not isinstance(token, str) or not token or len(token) > MAX_TOKEN_LENGTH:
            return await self._reject("invalid_token", "Invalid or expired token.", 4401)
        player = await self._player_from_token(token)
        if player is None:
            return await self._reject("invalid_token", "Invalid or expired token.", 4401)

        try:
            await self.channel_layer.group_add(events.GRID_GROUP, self.channel_name)
        except Exception:
            logger.exception("group_add failed (channel layer unavailable)")
            return await self._reject("service_unavailable", "Realtime service unavailable.", 1013)

        self.player = player
        self.authenticated = True
        if self._auth_task:
            self._auth_task.cancel()
        self._member = presence.member_id(player.id, self.channel_name)
        await presence.touch(self._member)
        online = await presence.count()
        await self._send_event(
            {
                "type": events.CONNECTION_READY,
                "data": {
                    "player": events.owner_payload(player),
                    "online_players": online,
                    "server_time": timezone.now().isoformat(),
                },
            }
        )
        await self._broadcast_presence(online)
        await self._touch_last_seen()

    async def _handle_ping(self):
        await presence.touch(self._member)
        online = await presence.count()
        await self._send_event(
            {"type": events.PONG, "data": {"online_players": online, "server_time": timezone.now().isoformat()}}
        )

    # -------------------------------------------------------------- outbound
    async def grid_event(self, message):
        """Handler for group_send messages of type ``grid.event``."""
        if self.authenticated:
            await self._send_event(message["event"])

    async def _send_event(self, event: dict):
        await self.send(text_data=json.dumps(event, separators=(",", ":")))

    async def _send_error(self, code: str, message: str):
        await self._send_event({"type": events.ERROR, "data": {"code": code, "message": message}})

    async def _reject(self, code: str, message: str, close_code: int):
        await self._send_error(code, message)
        await self.close(code=close_code)

    async def _malformed_message(self, message: str):
        self._malformed += 1
        if self._malformed >= MAX_MALFORMED or not self.authenticated:
            return await self._reject("malformed_message", message, 4400)
        await self._send_error("malformed_message", message)

    async def _broadcast_presence(self, online: int | None = None):
        if online is None:
            online = await presence.count()
        try:
            await self.channel_layer.group_send(
                events.GRID_GROUP,
                {"type": "grid.event", "event": events.presence_updated(online)},
            )
        except Exception:
            logger.warning("presence broadcast failed", exc_info=True)

    # --------------------------------------------------------------- helpers
    @database_sync_to_async
    def _player_from_token(self, raw_token: str) -> Player | None:
        try:
            token = AccessToken(raw_token)
            return Player.objects.filter(pk=token["user_id"]).first()
        except (TokenError, KeyError, ValueError):
            return None

    @database_sync_to_async
    def _save_last_seen(self):
        Player.objects.filter(pk=self.player.pk).update(last_seen_at=timezone.now())

    async def _touch_last_seen(self):
        try:
            await self._save_last_seen()
        except Exception:
            logger.warning("Could not update last_seen_at", exc_info=True)
