"""Autenticación JWT.

- Panel web (administrador, despachador): el access va en la respuesta y el refresh en una cookie
  httpOnly (SameSite=Lax, Secure en producción) limitada a /api/auth/.
- App del conductor: access y refresh en la respuesta; la app los guarda en el almacenamiento seguro
  del teléfono y envía Authorization: Bearer.
"""

import contextlib

from django.conf import settings
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .autenticacion import ROLES_APP, ROLES_PANEL, autenticar, emitir_tokens
from .models import Usuario
from .serializers import (
    AccessSerializer,
    LoginSerializer,
    RefreshSerializer,
    SesionAppSerializer,
    SesionPanelSerializer,
    TokensSerializer,
    UsuarioSesionSerializer,
)

SIN_SESION = {"detail": "La sesión no es válida o expiró.", "code": "sesion_invalida"}


def _poner_cookie(respuesta: Response, refresh: str) -> None:
    cookie = settings.JWT_COOKIE
    respuesta.set_cookie(
        cookie["nombre"],
        refresh,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=cookie["secure"],
        samesite=cookie["samesite"],
        path=cookie["ruta"],
    )


def _borrar_cookie(respuesta: Response) -> None:
    cookie = settings.JWT_COOKIE
    respuesta.delete_cookie(cookie["nombre"], path=cookie["ruta"], samesite=cookie["samesite"])


def _renovar(refresh: str, roles: frozenset[str]) -> dict | None:
    """Rota el refresh si sigue vigente y el usuario puede usar el canal; None si no."""
    try:
        usuario_id = RefreshToken(refresh)[settings.SIMPLE_JWT.get("USER_ID_CLAIM", "user_id")]
    except (TokenError, KeyError):
        return None
    usuario = Usuario.objects.filter(pk=usuario_id, activo=True, empresa__activa=True).first()
    if usuario is None or usuario.rol not in roles:
        return None
    serializer = TokenRefreshSerializer(data={"refresh": refresh})
    try:
        serializer.is_valid(raise_exception=True)
    except TokenError:
        return None
    return serializer.validated_data


class _VistaAuth(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get_authenticate_header(self, request):
        # Sin autenticadores DRF respondería 403 a las credenciales inválidas; deben ser 401.
        return 'Bearer realm="api"'


class _VistaLogin(_VistaAuth):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"


class LoginPanelView(_VistaLogin):
    @extend_schema(
        tags=["auth"],
        summary="Iniciar sesión en el panel web",
        request=LoginSerializer,
        responses={200: SesionPanelSerializer},
        description="Deja el refresh en la cookie httpOnly «refresh_panel».",
    )
    def post(self, request):
        datos = LoginSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        usuario = autenticar(datos.validated_data["email"], datos.validated_data["password"], ROLES_PANEL)
        refresh = emitir_tokens(usuario)
        respuesta = Response(
            {"access": str(refresh.access_token), "usuario": UsuarioSesionSerializer(usuario).data}
        )
        _poner_cookie(respuesta, str(refresh))
        return respuesta


class RefreshPanelView(_VistaAuth):
    @extend_schema(
        tags=["auth"],
        summary="Renovar el access del panel con la cookie de refresh",
        request=None,
        responses={200: AccessSerializer, 401: OpenApiResponse(description="Sin sesión válida")},
    )
    def post(self, request):
        tokens = _renovar(request.COOKIES.get(settings.JWT_COOKIE["nombre"], ""), ROLES_PANEL)
        if tokens is None:
            respuesta = Response(SIN_SESION, status=status.HTTP_401_UNAUTHORIZED)
            _borrar_cookie(respuesta)
            return respuesta
        respuesta = Response({"access": tokens["access"]})
        _poner_cookie(respuesta, tokens["refresh"])
        return respuesta


class LogoutPanelView(_VistaAuth):
    @extend_schema(tags=["auth"], summary="Cerrar sesión del panel", request=None, responses={204: None})
    def post(self, request):
        refresh = request.COOKIES.get(settings.JWT_COOKIE["nombre"])
        if refresh:
            with contextlib.suppress(TokenError):
                RefreshToken(refresh).blacklist()
        respuesta = Response(status=status.HTTP_204_NO_CONTENT)
        _borrar_cookie(respuesta)
        return respuesta


class LoginAppView(_VistaLogin):
    @extend_schema(
        tags=["auth"],
        summary="Iniciar sesión en la app del conductor",
        request=LoginSerializer,
        responses={200: SesionAppSerializer},
    )
    def post(self, request):
        datos = LoginSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        usuario = autenticar(datos.validated_data["email"], datos.validated_data["password"], ROLES_APP)
        refresh = emitir_tokens(usuario)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "usuario": UsuarioSesionSerializer(usuario).data,
            }
        )


class RefreshAppView(_VistaAuth):
    @extend_schema(
        tags=["auth"],
        summary="Renovar los tokens de la app del conductor",
        request=RefreshSerializer,
        responses={200: TokensSerializer, 401: OpenApiResponse(description="Sin sesión válida")},
    )
    def post(self, request):
        datos = RefreshSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        tokens = _renovar(datos.validated_data["refresh"], ROLES_APP)
        if tokens is None:
            return Response(SIN_SESION, status=status.HTTP_401_UNAUTHORIZED)
        return Response({"access": tokens["access"], "refresh": tokens["refresh"]})


class YoView(APIView):
    @extend_schema(
        tags=["auth"], summary="Usuario de la sesión actual", responses={200: UsuarioSesionSerializer}
    )
    def get(self, request):
        return Response(UsuarioSesionSerializer(request.user).data)
