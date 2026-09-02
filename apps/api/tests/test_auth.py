from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.identity import User


def test_login_success(client: TestClient, seeded_admin: User) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": seeded_admin.email, "password": "AdminSecurePass2026!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == seeded_admin.email
    assert data["role"] == "ADMIN"
    assert data["display_name"] == seeded_admin.display_name

    # Check cookies
    assert "doc_access" in response.cookies
    assert "doc_refresh" in response.cookies
    assert "doc_csrf" in response.cookies


def test_login_invalid_credentials(client: TestClient, seeded_admin: User) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": seeded_admin.email, "password": "WrongPassword123!"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."


def test_get_me_authenticated(client: TestClient, seeded_admin: User) -> None:
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": seeded_admin.email, "password": "AdminSecurePass2026!"},
    )
    assert login_res.status_code == 200

    me_res = client.get("/api/v1/auth/me")
    assert me_res.status_code == 200
    assert me_res.json()["email"] == seeded_admin.email
    assert me_res.json()["role"] == "ADMIN"


def test_get_me_unauthenticated(client: TestClient) -> None:
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_refresh_token_rotation(client: TestClient, seeded_admin: User) -> None:
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": seeded_admin.email, "password": "AdminSecurePass2026!"},
    )
    assert login_res.status_code == 200
    initial_refresh = login_res.cookies["doc_refresh"]

    # Call refresh
    refresh_res = client.post("/api/v1/auth/refresh")
    assert refresh_res.status_code == 200
    new_refresh = refresh_res.cookies["doc_refresh"]
    assert new_refresh != initial_refresh

    # Check that me still works with updated session
    me_res = client.get("/api/v1/auth/me")
    assert me_res.status_code == 200


def test_logout_revokes_session(client: TestClient, seeded_admin: User) -> None:
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": seeded_admin.email, "password": "AdminSecurePass2026!"},
    )
    assert login_res.status_code == 200
    csrf_token = login_res.cookies["doc_csrf"]

    # Logout requires CSRF header
    logout_res = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf_token})
    assert logout_res.status_code == 200

    # Next /me call should fail because session is revoked
    me_res = client.get("/api/v1/auth/me")
    assert me_res.status_code == 401


def test_password_reset_flow(client: TestClient, db_session: Session, seeded_admin: User) -> None:
    # Request reset
    req_res = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": seeded_admin.email},
    )
    assert req_res.status_code == 200

    # Get the raw token generated in service by importing service or finding it
    from app.auth.service import create_password_reset_token
    token = create_password_reset_token(db_session, email=seeded_admin.email)
    assert token is not None

    # Confirm reset with new password
    new_pass = "NewSecureAdminPassword2026!"
    confirm_res = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": new_pass},
    )
    assert confirm_res.status_code == 200

    # Verify old password fails
    old_login = client.post(
        "/api/v1/auth/login",
        json={"email": seeded_admin.email, "password": "AdminSecurePass2026!"},
    )
    assert old_login.status_code == 401

    # Verify new password succeeds
    new_login = client.post(
        "/api/v1/auth/login",
        json={"email": seeded_admin.email, "password": new_pass},
    )
    assert new_login.status_code == 200
