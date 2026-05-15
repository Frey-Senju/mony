"""
Goal endpoints unit tests — Story 2.5.

Covers 8 test cases:
  test_create_goal_basic            — POST 201, progress_pct = 0
  test_create_goal_with_initial     — POST 201, progress_pct calculated from initial amount
  test_list_goals_empty             — GET returns []
  test_list_goals_multiple          — GET returns all active goals ordered by creation
  test_deposit_to_goal              — PATCH /deposit increases current_amount
  test_deposit_achieves_goal        — achieved_at set when current >= target
  test_update_goal                  — PUT updates name and target_amount
  test_delete_goal_soft             — DELETE 204, excluded from GET
  test_goal_isolation               — user A cannot see user B's goals
"""

import pytest
from datetime import datetime

from fastapi.testclient import TestClient

from database.models import Goal, User, UserPlan
from main import app
from utils.auth import create_access_token, hash_password

client = TestClient(app)


# ============ Fixtures ============


@pytest.fixture
def user_a(db_session):
    u = User(
        email="user_a@example.com",
        password_hash=hash_password("Pass123!"),
        full_name="User A",
        is_email_verified=True,
        plan=UserPlan.BASIC,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def user_b(db_session):
    u = User(
        email="user_b@example.com",
        password_hash=hash_password("Pass123!"),
        full_name="User B",
        is_email_verified=True,
        plan=UserPlan.BASIC,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _auth(user: User) -> dict:
    token = create_access_token(str(user.id))
    return {"Authorization": f"Bearer {token}"}


def _create_goal(db_session, user: User, name: str, target: float, current: float = 0.0) -> Goal:
    goal = Goal(
        user_id=user.id,
        name=name,
        target_amount=target,
        current_amount=current,
        currency="BRL",
        is_active=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(goal)
    db_session.commit()
    db_session.refresh(goal)
    return goal


# ============ Tests ============


def test_create_goal_basic(db_session, user_a):
    res = client.post(
        "/goals",
        json={"name": "Reserva de emergência", "target_amount": 10000.00},
        headers=_auth(user_a),
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Reserva de emergência"
    assert float(data["target_amount"]) == 10000.00
    assert float(data["current_amount"]) == 0.00
    assert float(data["progress_pct"]) == 0.00
    assert float(data["remaining_amount"]) == 10000.00
    assert data["is_achieved"] is False
    assert data["achieved_at"] is None


def test_create_goal_with_initial_amount(db_session, user_a):
    res = client.post(
        "/goals",
        json={"name": "Viagem", "target_amount": 5000.00, "current_amount": 2500.00},
        headers=_auth(user_a),
    )
    assert res.status_code == 201
    data = res.json()
    assert float(data["progress_pct"]) == 50.00
    assert float(data["remaining_amount"]) == 2500.00
    assert data["is_achieved"] is False


def test_list_goals_empty(db_session, user_a):
    res = client.get("/goals", headers=_auth(user_a))
    assert res.status_code == 200
    assert res.json() == []


def test_list_goals_multiple(db_session, user_a):
    _create_goal(db_session, user_a, "Meta A", 1000)
    _create_goal(db_session, user_a, "Meta B", 2000)
    res = client.get("/goals", headers=_auth(user_a))
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2
    assert data[0]["name"] == "Meta A"
    assert data[1]["name"] == "Meta B"


def test_deposit_to_goal(db_session, user_a):
    goal = _create_goal(db_session, user_a, "Reserva", 5000, current=1000)
    res = client.patch(
        f"/goals/{goal.id}/deposit",
        json={"amount": 500.00},
        headers=_auth(user_a),
    )
    assert res.status_code == 200
    data = res.json()
    assert float(data["current_amount"]) == 1500.00
    assert float(data["progress_pct"]) == 30.00
    assert data["is_achieved"] is False
    assert data["achieved_at"] is None


def test_deposit_achieves_goal(db_session, user_a):
    goal = _create_goal(db_session, user_a, "Reserva", 1000, current=900)
    res = client.patch(
        f"/goals/{goal.id}/deposit",
        json={"amount": 100.00},
        headers=_auth(user_a),
    )
    assert res.status_code == 200
    data = res.json()
    assert float(data["current_amount"]) == 1000.00
    assert float(data["progress_pct"]) == 100.00
    assert data["is_achieved"] is True
    assert data["achieved_at"] is not None


def test_update_goal(db_session, user_a):
    goal = _create_goal(db_session, user_a, "Old Name", 1000)
    res = client.put(
        f"/goals/{goal.id}",
        json={"name": "New Name", "target_amount": 2000.00},
        headers=_auth(user_a),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "New Name"
    assert float(data["target_amount"]) == 2000.00


def test_delete_goal_soft(db_session, user_a):
    goal = _create_goal(db_session, user_a, "Para deletar", 500)
    res = client.delete(f"/goals/{goal.id}", headers=_auth(user_a))
    assert res.status_code == 204

    list_res = client.get("/goals", headers=_auth(user_a))
    assert all(g["id"] != str(goal.id) for g in list_res.json())


def test_goal_isolation(db_session, user_a, user_b):
    _create_goal(db_session, user_b, "Meta de B", 3000)
    res = client.get("/goals", headers=_auth(user_a))
    assert res.status_code == 200
    assert res.json() == []
