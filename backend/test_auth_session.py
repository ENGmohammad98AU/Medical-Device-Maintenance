"""Exercise real JWT authentication, without bypassing its dependencies."""
from datetime import timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import auth, fault_reports, intelligent_support
from app.database.base import Base
from app.database.connection import get_db
from app.models.user import User, UserRole
from app.models.device import Device, DeviceType, DeviceStatus
from app.models.maintenance import MaintenanceRecord  # noqa: F401
from app.security.jwt import create_access_token
from app.security.password import get_password_hash


@pytest.fixture
def session_api():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    user = User(username="session-engineer", email="session@example.com", full_name="Session Engineer",
                hashed_password=get_password_hash("test-password-123"), role=UserRole.BIOMEDICAL_ENGINEER,
                is_active=True)
    db.add_all([user, Device(id=901, name="Hamilton C6 Ventilator", type=DeviceType.VENTILATOR,
        manufacturer="Hamilton Medical", model="C6", serial_number="SESSION-TEST-C6",
        department="ICU", status=DeviceStatus.OPERATIONAL)])
    db.commit()
    app = FastAPI()
    for router in (auth.router, intelligent_support.router, fault_reports.router):
        app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as client:
        yield client, db, user
    db.close()
    engine.dispose()


def test_login_session_can_validate_and_prepare_local_analysis(session_api):
    client, _, user = session_api
    login = client.post("/api/auth/login", data={"username": user.username, "password": "test-password-123"})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    current = client.get("/api/auth/me", headers=headers)
    assert current.status_code == 200, current.text
    assert current.json()["username"] == user.username
    assert "hashed_password" not in current.json()
    prepared = client.post("/api/intelligent-support/prepare-support", headers=headers,
        json={"device_id": 901, "description": "The ventilator battery is not charging"})
    assert prepared.status_code == 200, prepared.text
    assert prepared.json()["input_sha256"]


@pytest.mark.parametrize("token_kind", ["expired", "tampered", "missing_user", "missing"])
def test_invalid_session_is_rejected_before_any_analysis(session_api, token_kind):
    client, _, user = session_api
    token = create_access_token({"sub": user.username}, expires_delta=timedelta(minutes=-1 if token_kind == "expired" else 30))
    if token_kind == "tampered":
        header, payload, _ = token.split(".")
        token = f"{header}.{payload}.invalid-signature"
    elif token_kind == "missing_user":
        token = create_access_token({"sub": "deleted-user"})
    headers = {} if token_kind == "missing" else {"Authorization": f"Bearer {token}"}
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    for path, body in [
        ("/api/intelligent-support/prepare-support", {"device_id": 901, "description": "Battery not charging"}),
        ("/api/intelligent-support/analyze-fault", {"device_id": 901, "description": "Battery not charging"}),
        ("/api/fault-reports/analyze", {"device_id": 901, "error_message": "Battery not charging"}),
    ]:
        response = client.post(path, headers=headers, json=body)
        assert response.status_code == 401, response.text


def test_disabled_account_cannot_restore_session(session_api):
    client, db, user = session_api
    token = create_access_token({"sub": user.username})
    user.is_active = False
    db.commit()
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 400
