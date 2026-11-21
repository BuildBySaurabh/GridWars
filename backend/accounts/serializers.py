from rest_framework import serializers

from .models import Player
from .validators import validate_color, validate_username


class PlayerSerializer(serializers.ModelSerializer):
    """Public view of a player. Never exposes internal fields."""

    class Meta:
        model = Player
        fields = ("id", "username", "color")
        read_only_fields = fields


class JoinSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=20, trim_whitespace=True, validators=[validate_username])
    color = serializers.CharField(max_length=7, validators=[validate_color])

    def validate_color(self, value: str) -> str:
        return value.upper()


class JoinResponseSerializer(serializers.Serializer):
    token = serializers.CharField()
    token_type = serializers.CharField()
    expires_in = serializers.IntegerField()
    player = PlayerSerializer()


class PlayerStatsSerializer(serializers.Serializer):
    captured_cells = serializers.IntegerField()
    capture_percentage = serializers.FloatField()
    rank = serializers.IntegerField(allow_null=True)


class MeSerializer(serializers.Serializer):
    player = PlayerSerializer()
    stats = PlayerStatsSerializer()
