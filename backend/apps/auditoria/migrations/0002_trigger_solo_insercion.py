# RN-12: AUDITORIA es de solo inserción también en la base de datos (cualquier cliente, no solo Django).

from django.db import migrations

CREAR = """
CREATE OR REPLACE FUNCTION auditoria_solo_insercion() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'AUDITORIA es de solo inserción (RN-12)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auditoria_sin_cambios
    BEFORE UPDATE OR DELETE ON auditoria
    FOR EACH ROW EXECUTE FUNCTION auditoria_solo_insercion();
"""

BORRAR = """
DROP TRIGGER IF EXISTS auditoria_sin_cambios ON auditoria;
DROP FUNCTION IF EXISTS auditoria_solo_insercion();
"""


class Migration(migrations.Migration):
    dependencies = [
        ("auditoria", "0001_initial"),
    ]

    operations = [migrations.RunSQL(CREAR, BORRAR)]
