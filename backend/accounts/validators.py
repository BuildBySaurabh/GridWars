"""Username and colour validation for guest players."""
import re

from django.core.exceptions import ValidationError

USERNAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{2,19}$")
COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

RESERVED_NAMES = {
    "admin", "administrator", "root", "system", "moderator", "mod", "support",
    "gridwars", "staff", "null", "none", "undefined", "anonymous", "guest",
}

# Baseline filter only. Long stems are matched as substrings (this accepts a few
# false positives, e.g. place names containing a stem); short words that occur
# inside many innocent names ("dick", "cock", "ass") are matched exactly instead.
# Swap for a maintained moderation service in production.
BLOCKED_SUBSTRINGS = (
    "fuck", "shit", "bitch", "cunt", "nigg", "fagg", "whore", "slut",
    "hitler", "nazi", "rapist", "asshole", "pussy", "retard",
)
BLOCKED_EXACT = {"dick", "cock", "rape", "ass", "anus", "tits", "cum"}

_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t"})


def validate_username(value: str) -> str:
    if not USERNAME_RE.match(value):
        raise ValidationError(
            "Username must be 3-20 characters, start with a letter or number, "
            "and contain only letters, numbers, underscores or hyphens."
        )
    lowered = value.lower()
    squashed = lowered.translate(_LEET).replace("_", "").replace("-", "")
    if lowered in RESERVED_NAMES:
        raise ValidationError("That username is reserved.")
    if squashed in BLOCKED_EXACT or any(term in squashed for term in BLOCKED_SUBSTRINGS):
        raise ValidationError("That username is not allowed.")
    return value


def _relative_luminance(hex_color: str) -> float:
    channels = [int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def validate_color(value: str) -> str:
    if not COLOR_RE.match(value):
        raise ValidationError("Color must be a hex value like #8B5CF6.")
    if _relative_luminance(value) < 0.03:
        raise ValidationError("That color is too dark to be visible on the grid. Pick a brighter one.")
    return value
