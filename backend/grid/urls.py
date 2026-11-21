from django.urls import path

from .views import CaptureView, GridStatsView, GridView, LeaderboardView

urlpatterns = [
    path("grid/", GridView.as_view(), name="grid"),
    path("grid/stats/", GridStatsView.as_view(), name="grid-stats"),
    path("grid/cells/<str:cell_id>/capture/", CaptureView.as_view(), name="cell-capture"),
    path("leaderboard/", LeaderboardView.as_view(), name="leaderboard"),
]
