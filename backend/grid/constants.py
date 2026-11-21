GRID_SIZE = 25
TOTAL_CELLS = GRID_SIZE * GRID_SIZE  # 625


def cell_id_for(row: int, column: int) -> int:
    """Deterministic 1-based id: (0,0) -> 1, (24,24) -> 625."""
    return row * GRID_SIZE + column + 1
