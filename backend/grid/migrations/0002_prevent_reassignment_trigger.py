from django.db import migrations

FORWARD = """
CREATE FUNCTION grid_cell_prevent_reassign() RETURNS trigger AS $$
BEGIN
    IF OLD.owner_id IS NOT NULL AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
        RAISE EXCEPTION 'grid cell % is already captured and cannot be reassigned', OLD.id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER grid_cell_no_reassign
    BEFORE UPDATE ON grid_gridcell
    FOR EACH ROW EXECUTE FUNCTION grid_cell_prevent_reassign();
"""

REVERSE = """
DROP TRIGGER IF EXISTS grid_cell_no_reassign ON grid_gridcell;
DROP FUNCTION IF EXISTS grid_cell_prevent_reassign();
"""


class Migration(migrations.Migration):
    """Defence in depth: even a buggy code path or manual SQL cannot hand an
    already-captured cell to a different player in the standard game mode."""

    dependencies = [("grid", "0001_initial")]
    operations = [migrations.RunSQL(FORWARD, REVERSE)]
