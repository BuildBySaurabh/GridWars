from rest_framework import serializers

from accounts.serializers import PlayerSerializer

from .models import GridCell


class CellSerializer(serializers.ModelSerializer):
    owner = PlayerSerializer(read_only=True, allow_null=True)

    class Meta:
        model = GridCell
        fields = ("id", "row", "column", "owner", "captured_at", "version")
        read_only_fields = fields


class GridSnapshotSerializer(serializers.Serializer):
    cells = CellSerializer(many=True)
    server_time = serializers.DateTimeField()


class GridStatsSerializer(serializers.Serializer):
    total_cells = serializers.IntegerField()
    captured_cells = serializers.IntegerField()
    unclaimed_cells = serializers.IntegerField()
    total_players = serializers.IntegerField()
    capture_percentage = serializers.FloatField()


class LeaderboardEntrySerializer(serializers.Serializer):
    rank = serializers.IntegerField()
    player = PlayerSerializer()
    captured_cells = serializers.IntegerField()
    capture_percentage = serializers.FloatField()


class LeaderboardSerializer(serializers.Serializer):
    entries = LeaderboardEntrySerializer(many=True)
    server_time = serializers.DateTimeField()
