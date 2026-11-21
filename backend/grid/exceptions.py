from rest_framework import status
from rest_framework.exceptions import APIException, NotFound, ValidationError


class CellNotFound(NotFound):
    default_detail = "That cell does not exist."
    default_code = "cell_not_found"


class InvalidCellId(ValidationError):
    default_detail = "Cell id must be a positive integer."
    default_code = "invalid_cell_id"


class CellAlreadyCaptured(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "That cell has already been captured."
    default_code = "cell_already_captured"

    def __init__(self, extra: dict | None = None):
        super().__init__()
        self.extra = extra or {}
