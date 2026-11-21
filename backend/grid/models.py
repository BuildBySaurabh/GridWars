from django.conf import settings
from django.db import models
from django.db.models import F, Q

from .constants import GRID_SIZE


class GridCell(models.Model):
    """One cell of the shared grid. PostgreSQL is the source of truth for ownership."""

    id = models.IntegerField(primary_key=True)  # deterministic, see constants.cell_id_for
    row = models.PositiveSmallIntegerField()
    column = models.PositiveSmallIntegerField()
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="cells",
    )
    captured_at = models.DateTimeField(null=True, blank=True)
    # Incremented on every change; lets clients discard stale events.
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["row", "column"], name="uniq_cell_row_column"),
            models.CheckConstraint(
                condition=Q(row__gte=0, row__lt=GRID_SIZE, column__gte=0, column__lt=GRID_SIZE),
                name="cell_within_grid",
            ),
            models.CheckConstraint(
                condition=Q(id=F("row") * GRID_SIZE + F("column") + 1),
                name="cell_id_matches_coordinates",
            ),
            models.CheckConstraint(
                condition=(Q(owner__isnull=True, captured_at__isnull=True) | Q(owner__isnull=False, captured_at__isnull=False)),
                name="cell_owner_and_timestamp_together",
            ),
        ]
        indexes = [models.Index(fields=["-captured_at"], name="cell_captured_at_idx")]

    def __str__(self) -> str:
        return f"Cell {self.id} ({self.row},{self.column})"
