from django.core.management.base import BaseCommand
from django.db import transaction

from grid.constants import GRID_SIZE, TOTAL_CELLS, cell_id_for
from grid.models import GridCell


class Command(BaseCommand):
    help = f"Create the {GRID_SIZE}x{GRID_SIZE} grid ({TOTAL_CELLS} cells). Safe to run repeatedly."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="DESTRUCTIVE: delete every cell (and all ownership) before re-creating them.",
        )

    def handle(self, *args, **options):
        with transaction.atomic():
            if options["reset"]:
                GridCell.objects.all().delete()
                self.stdout.write(self.style.WARNING("All cells deleted."))
            before = GridCell.objects.count()
            GridCell.objects.bulk_create(
                [
                    GridCell(id=cell_id_for(row, column), row=row, column=column)
                    for row in range(GRID_SIZE)
                    for column in range(GRID_SIZE)
                ],
                ignore_conflicts=True,
            )
            after = GridCell.objects.count()
        self.stdout.write(
            self.style.SUCCESS(f"Grid ready: {after} cells ({after - before} created).")
        )
