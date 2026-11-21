import re

from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from config.throttles import CaptureRateThrottle

from .constants import TOTAL_CELLS
from .exceptions import CellNotFound, InvalidCellId
from .serializers import (
    CellSerializer,
    GridSnapshotSerializer,
    GridStatsSerializer,
    LeaderboardSerializer,
)
from .services import capture_cell, get_grid_snapshot, get_leaderboard, get_stats

_DIGITS = re.compile(r"^\d{1,9}$")


class GridView(APIView):
    """Full snapshot of all 625 cells. Clients refetch this after reconnecting."""

    @extend_schema(responses={200: GridSnapshotSerializer})
    def get(self, request):
        return Response(GridSnapshotSerializer(get_grid_snapshot()).data)


class GridStatsView(APIView):
    @extend_schema(responses={200: GridStatsSerializer})
    def get(self, request):
        return Response(get_stats())


class CaptureView(APIView):
    """Capture a cell for the authenticated player.

    Returns 200 with the cell on success, 409 if someone else got there first,
    404 for an unknown cell and 400 for a malformed id.
    """

    throttle_classes = [CaptureRateThrottle]

    @extend_schema(request=None, responses={200: CellSerializer})
    def post(self, request, cell_id: str):
        if not _DIGITS.match(cell_id):
            raise InvalidCellId()
        number = int(cell_id)
        if not 1 <= number <= TOTAL_CELLS:
            raise CellNotFound()
        cell = capture_cell(player=request.user, cell_id=number)
        return Response(CellSerializer(cell).data)


class LeaderboardView(APIView):
    @extend_schema(
        parameters=[OpenApiParameter("limit", int, description="Max entries (1-50, default 10)")],
        responses={200: LeaderboardSerializer},
    )
    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", 10))
        except ValueError:
            limit = 10
        limit = max(1, min(limit, 50))
        return Response({"entries": get_leaderboard(limit), "server_time": timezone.now()})
