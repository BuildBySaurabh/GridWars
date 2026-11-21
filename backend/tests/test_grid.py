"""Grid creation and database-level integrity."""
import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from grid.constants import GRID_SIZE, TOTAL_CELLS, cell_id_for
from grid.models import GridCell

pytestmark = pytest.mark.django_db


def test_seed_creates_exactly_625_cells(seeded_grid):
    assert GridCell.objects.count() == 625 == TOTAL_CELLS
    assert GRID_SIZE == 25


def test_seed_is_idempotent_and_keeps_ownership(seeded_grid, make_player):
    from django.core.management import call_command

    player = make_player()
    GridCell.objects.filter(pk=1).update(owner=player, captured_at=timezone.now())
    call_command("seed_grid", verbosity=0)
    assert GridCell.objects.count() == 625
    assert GridCell.objects.get(pk=1).owner_id == player.id


def test_cell_ids_follow_coordinates(seeded_grid):
    for cell in GridCell.objects.all():
        assert cell.id == cell_id_for(cell.row, cell.column)
        assert 0 <= cell.row < GRID_SIZE and 0 <= cell.column < GRID_SIZE
    assert GridCell.objects.get(row=4, column=19).id == 120  # matches the documented example event
    assert GridCell.objects.filter(version=1, owner__isnull=True).count() == 625


def test_database_rejects_cells_outside_the_grid(seeded_grid):
    with pytest.raises(IntegrityError), transaction.atomic():
        GridCell.objects.create(id=25 * 25 + 26, row=25, column=0)


def test_database_rejects_duplicate_coordinates(seeded_grid):
    with pytest.raises(IntegrityError), transaction.atomic():
        GridCell.objects.create(id=9999, row=0, column=0)


def test_owner_and_timestamp_must_be_set_together(seeded_grid, make_player):
    player = make_player()
    with pytest.raises(IntegrityError), transaction.atomic():
        GridCell.objects.filter(pk=5).update(owner=player)  # no captured_at


def test_database_trigger_blocks_reassigning_an_owned_cell(seeded_grid, make_player):
    first, second = make_player(), make_player()
    GridCell.objects.filter(pk=7).update(owner=first, captured_at=timezone.now())
    with pytest.raises(IntegrityError, match="already captured"), transaction.atomic():
        GridCell.objects.filter(pk=7).update(owner=second)
    assert GridCell.objects.get(pk=7).owner_id == first.id
