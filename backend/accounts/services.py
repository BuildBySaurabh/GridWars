from django.db import IntegrityError, transaction
from rest_framework_simplejwt.tokens import AccessToken

from .exceptions import UsernameTaken
from .models import Player


def create_guest_player(*, username: str, color: str) -> Player:
    """Create a guest player. Username uniqueness is case-insensitive and enforced
    by a database constraint, so concurrent joins cannot create duplicates."""
    if Player.objects.filter(username__iexact=username).exists():
        raise UsernameTaken()
    player = Player(username=username, color=color.upper())
    player.set_unusable_password()
    try:
        with transaction.atomic():
            player.save(force_insert=True)
    except IntegrityError:
        if Player.objects.filter(username__iexact=username).exists():
            raise UsernameTaken() from None
        raise
    return player


def issue_access_token(player: Player) -> tuple[str, int]:
    """Return (jwt, lifetime_seconds)."""
    token = AccessToken.for_user(player)
    return str(token), int(token.lifetime.total_seconds())
