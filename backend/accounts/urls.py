from django.urls import path

from .views import JoinView, MeView

urlpatterns = [
    path("join/", JoinView.as_view(), name="player-join"),
    path("me/", MeView.as_view(), name="player-me"),
]
