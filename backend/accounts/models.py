import uuid

from django.contrib.auth.models import AbstractBaseUser
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone


class Player(AbstractBaseUser):
    """A guest player. There is no password: identity is a signed JWT issued at join."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # unique=True satisfies Django's auth check; the Lower() constraint below
    # additionally makes uniqueness case-insensitive ("Bob" vs "bob").
    username = models.CharField(max_length=20, unique=True)
    color = models.CharField(max_length=7, help_text="Hex colour such as #8B5CF6")
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    last_seen_at = models.DateTimeField(default=timezone.now)

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["color"]

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("username"), name="uniq_player_username_ci"),
            models.CheckConstraint(
                condition=models.Q(color__regex=r"^#[0-9A-F]{6}$"),
                name="player_color_is_hex",
            ),
        ]

    def __str__(self) -> str:
        return self.username
