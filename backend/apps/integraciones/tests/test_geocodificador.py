import io
import json
import urllib.error

import pytest

from apps.integraciones import geocodificador as g

RM = g.Zona(-34.3, -32.92, -71.72, -69.77)


class TestDesarrollo:
    def test_deterministico_y_dentro_de_la_zona(self):
        geo = g.GeocodificadorDesarrollo()
        a = geo.geocodificar("Av. Providencia 1234, Providencia", RM)
        assert a == geo.geocodificar("  av. providencia   1234, PROVIDENCIA ", RM)
        assert RM.contiene(a)

    def test_ignora_tildes(self):
        geo = g.GeocodificadorDesarrollo()
        assert geo.geocodificar("Ñuñoa", RM) == geo.geocodificar("Nunoa", RM)

    def test_direcciones_distintas_dan_puntos_distintos(self):
        geo = g.GeocodificadorDesarrollo()
        puntos = {geo.geocodificar(f"Calle {n}", RM) for n in range(30)}
        assert len(puntos) == 30
        assert all(RM.contiene(p) for p in puntos)

    @pytest.mark.parametrize("texto", ["Aeropuerto Arturo Merino Benítez", "terminal SCL"])
    def test_aeropuerto(self, texto):
        assert g.GeocodificadorDesarrollo().geocodificar(texto, RM) == g.Coordenadas(*g.AEROPUERTO_SCL)

    def test_se_acota_a_una_zona_pequena(self):
        zona = g.Zona(-33.45, -33.44, -70.67, -70.66)
        assert zona.contiene(g.GeocodificadorDesarrollo().geocodificar("Cualquier calle 123", zona))

    def test_direccion_vacia(self):
        with pytest.raises(g.GeocodificacionError):
            g.GeocodificadorDesarrollo().geocodificar("   ", RM)


def _respuesta(datos: dict):
    return io.BytesIO(json.dumps(datos).encode())


OK = {"status": "OK", "results": [{"geometry": {"location": {"lat": -33.41, "lng": -70.6}}}]}


class TestGoogle:
    def _geo(self, monkeypatch, respuestas):
        llamadas = []

        def urlopen(url, timeout):
            llamadas.append(url)
            r = respuestas.pop(0)
            if isinstance(r, Exception):
                raise r
            return _respuesta(r)

        monkeypatch.setattr(g.urllib.request, "urlopen", urlopen)
        monkeypatch.setattr(g.time, "sleep", lambda s: None)
        return g.GeocodificadorGoogle("clave-falsa", intentos=3), llamadas

    def test_ok(self, monkeypatch):
        geo, llamadas = self._geo(monkeypatch, [OK])
        assert geo.geocodificar("Av. Providencia 1234", RM) == g.Coordenadas(-33.41, -70.6)
        assert llamadas[0].startswith("https://maps.googleapis.com/maps/api/geocode/json?")
        assert "components=country%3ACL" in llamadas[0]

    def test_sin_resultados(self, monkeypatch):
        geo, _ = self._geo(monkeypatch, [{"status": "ZERO_RESULTS", "results": []}])
        with pytest.raises(g.GeocodificacionError, match="No se encontró"):
            geo.geocodificar("xyz", RM)

    def test_reintenta_errores_transitorios(self, monkeypatch):
        geo, llamadas = self._geo(
            monkeypatch, [urllib.error.URLError("caído"), {"status": "OVER_QUERY_LIMIT"}, OK]
        )
        assert geo.geocodificar("Av. Providencia 1234", RM) == g.Coordenadas(-33.41, -70.6)
        assert len(llamadas) == 3

    def test_agota_los_intentos(self, monkeypatch):
        geo, _ = self._geo(monkeypatch, [TimeoutError(), TimeoutError(), TimeoutError()])
        with pytest.raises(g.GeocodificacionError, match="no está disponible"):
            geo.geocodificar("Av. Providencia 1234", RM)

    def test_error_no_transitorio(self, monkeypatch):
        geo, llamadas = self._geo(monkeypatch, [{"status": "REQUEST_DENIED"}])
        with pytest.raises(g.GeocodificacionError, match="REQUEST_DENIED"):
            geo.geocodificar("Av. Providencia 1234", RM)
        assert len(llamadas) == 1


def test_seleccion_segun_la_clave(settings):
    settings.GOOGLE_GEOCODING_API_KEY = ""
    assert isinstance(g.obtener_geocodificador(), g.GeocodificadorDesarrollo)
    settings.GOOGLE_GEOCODING_API_KEY = "clave"
    assert isinstance(g.obtener_geocodificador(), g.GeocodificadorGoogle)
