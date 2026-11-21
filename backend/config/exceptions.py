"""Consistent JSON error envelope for every API failure.

Shape: {"error": {"code": str, "message": str, "details": object}}
"""
import logging
from typing import Any

from django.db import DatabaseError
from django.http import JsonResponse
from rest_framework import exceptions as drf_exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def error_body(code: str, message: str, details: Any = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details or {}}}


def api_exception_handler(exc, context):
    # Database trouble: never leak driver details to the client.
    if isinstance(exc, DatabaseError):
        logger.exception("Database error while handling request")
        return Response(
            error_body("service_unavailable", "The service is temporarily unavailable. Please retry."),
            status=503,
        )

    response = drf_exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled exception while handling request")
        return Response(error_body("server_error", "An unexpected error occurred."), status=500)

    if isinstance(exc, drf_exceptions.ValidationError):
        response.data = error_body("validation_error", "The request data is invalid.", response.data)
    elif isinstance(exc, drf_exceptions.APIException):
        code = exc.default_code
        details = getattr(exc, "extra", None)
        if isinstance(exc, drf_exceptions.Throttled) and exc.wait is not None:
            details = {"retry_after_seconds": int(exc.wait)}
        response.data = error_body(code, str(exc.detail), details)
    else:
        response.data = error_body("error", "Request failed.")
    return response


def json_404(request, exception=None):
    return JsonResponse(error_body("not_found", "Not found."), status=404)


def json_500(request):
    return JsonResponse(error_body("server_error", "An unexpected error occurred."), status=500)
