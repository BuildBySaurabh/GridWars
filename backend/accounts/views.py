from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from config.throttles import JoinRateThrottle
from grid.services import get_player_stats

from .serializers import (
    JoinResponseSerializer,
    JoinSerializer,
    MeSerializer,
    PlayerSerializer,
)
from .services import create_guest_player, issue_access_token


class JoinView(APIView):
    """Create a guest player and return a JWT access token."""

    authentication_classes: list = []  # a stale token must not block joining
    permission_classes = [AllowAny]
    throttle_classes = [JoinRateThrottle]

    @extend_schema(request=JoinSerializer, responses={201: JoinResponseSerializer}, auth=[])
    def post(self, request):
        serializer = JoinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        player = create_guest_player(**serializer.validated_data)
        token, expires_in = issue_access_token(player)
        return Response(
            {
                "token": token,
                "token_type": "Bearer",
                "expires_in": expires_in,
                "player": PlayerSerializer(player).data,
            },
            status=status.HTTP_201_CREATED,
        )


class MeView(APIView):
    """The authenticated player and their statistics."""

    @extend_schema(responses={200: MeSerializer})
    def get(self, request):
        return Response(
            {
                "player": PlayerSerializer(request.user).data,
                "stats": get_player_stats(request.user),
            }
        )
