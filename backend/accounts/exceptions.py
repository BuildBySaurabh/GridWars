from rest_framework import status
from rest_framework.exceptions import APIException


class UsernameTaken(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "That username is already taken."
    default_code = "username_taken"
