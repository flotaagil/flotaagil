from django.db import models


class CharFijo(models.CharField):
    """CHAR(n) de largo fijo, como lo define el Anexo D (p. ej. CONVENIO.token_link CHAR(43))."""

    def db_type(self, connection):
        return f"char({self.max_length})"
