from django.urls import path

from . import views

urlpatterns = [
    path("token/", views.LoginPanelView.as_view(), name="auth-token"),
    path("refresh/", views.RefreshPanelView.as_view(), name="auth-refresh"),
    path("logout/", views.LogoutPanelView.as_view(), name="auth-logout"),
    path("app/token/", views.LoginAppView.as_view(), name="auth-app-token"),
    path("app/refresh/", views.RefreshAppView.as_view(), name="auth-app-refresh"),
    path("yo/", views.YoView.as_view(), name="auth-yo"),
]
