from django.urls import path

from .consumers import GridConsumer

websocket_urlpatterns = [
    path("ws/grid/", GridConsumer.as_asgi()),
]
