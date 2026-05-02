"""Backend tests for Earnings Distribution (iteration 4)
Validates:
- Normalize_job returns 18 fields (15 + Photo + technician_share + boss_share)
- POST /api/jobs computes technician_share + boss_share correctly
- POST /api/jobs/update recomputes all derived fields consistently
- Status-only update regression still works
- Legacy-row backward compat: rows w/o technician_share/boss_share get derived
"""
import os
import pytest
import requests

def _load_base_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        try:
            from dotenv import dotenv_values
            url = dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL")
        except Exception:
            pass
    if not url:
        raise RuntimeError("REACT_APP_BACKEND_URL not set in env or /app/frontend/.env")
    return url.rstrip("/")

BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"

REQUIRED_FIELDS = {
    "ID", "Name", "Phone", "Model", "Work",
    "Cost", "Amount", "Profit", "Percentage", "Share",
    "Status", "received_date", "received_time",
    "completed_date", "completed_time",
    "Photo", "technician_share", "boss_share",
}


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _add(client, **overrides):
    payload = {
        "name": "TEST_Earn",
        "phone": "9999900001",
        "model": "iPhone 14",
        "work": "Screen",
        "cost": 1200,
        "amount": 3000,
        "percentage": 30,
    }
    payload.update(overrides)
    r = client.post(f"{API}/jobs", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def _get_job(client, jid):
    r = client.get(f"{API}/jobs")
    assert r.status_code == 200
    for j in r.json():
        if j["ID"] == jid:
            return j
    return None


class TestAddJobEarnings:
    """POST /api/jobs computes technician_share + boss_share"""

    def test_default_30pct(self, client):
        j = _add(client, cost=1200, amount=3000, percentage=30)
        assert j["Profit"] == 1800
        assert j["technician_share"] == 540
        assert j["boss_share"] == 1260
        assert j["Share"] == 540  # legacy Share == technician_share
        # Cross-check: tech + boss == profit
        assert round(j["technician_share"] + j["boss_share"], 2) == j["Profit"]
        # Persistence
        fetched = _get_job(client, j["ID"])
        assert fetched is not None
        assert fetched["technician_share"] == 540
        assert fetched["boss_share"] == 1260

    def test_40pct(self, client):
        j = _add(client, cost=1200, amount=3000, percentage=40)
        assert j["Profit"] == 1800
        assert j["technician_share"] == 720
        assert j["boss_share"] == 1080

    def test_zero_profit(self, client):
        j = _add(client, cost=500, amount=500, percentage=30)
        assert j["Profit"] == 0
        assert j["technician_share"] == 0
        assert j["boss_share"] == 0

    def test_negative_profit(self, client):
        j = _add(client, cost=2000, amount=1500, percentage=30)
        assert j["Profit"] == -500
        assert j["technician_share"] == -150
        assert j["boss_share"] == -350


class TestNormalizeShape:
    """GET /api/jobs returns 18 fields per job"""

    def test_fields_present(self, client):
        _add(client)  # ensure there's at least one
        r = client.get(f"{API}/jobs")
        assert r.status_code == 200
        jobs = r.json()
        assert len(jobs) > 0
        for j in jobs:
            missing = REQUIRED_FIELDS - set(j.keys())
            assert not missing, f"Missing fields: {missing}"
            # Invariants
            assert isinstance(j["technician_share"], (int, float))
            assert isinstance(j["boss_share"], (int, float))


class TestUpdateRecompute:
    """POST /api/jobs/update recomputes tech/boss/profit consistently"""

    def test_update_amount(self, client):
        j = _add(client, cost=1000, amount=2000, percentage=30)
        jid = j["ID"]
        r = client.post(f"{API}/jobs/update", json={"id": jid, "amount": 3000})
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        keys = set(body["updated"])
        assert {"Amount", "Profit", "Share", "technician_share", "boss_share"} <= keys
        fetched = _get_job(client, jid)
        assert fetched["Amount"] == 3000
        assert fetched["Profit"] == 2000
        assert fetched["technician_share"] == 600
        assert fetched["boss_share"] == 1400

    def test_update_percentage(self, client):
        j = _add(client, cost=1200, amount=3000, percentage=30)
        jid = j["ID"]
        r = client.post(f"{API}/jobs/update", json={"id": jid, "percentage": 40})
        assert r.status_code == 200
        fetched = _get_job(client, jid)
        assert fetched["Percentage"] == 40
        assert fetched["Profit"] == 1800
        assert fetched["technician_share"] == 720
        assert fetched["boss_share"] == 1080

    def test_update_cost(self, client):
        j = _add(client, cost=1000, amount=3000, percentage=30)
        jid = j["ID"]
        r = client.post(f"{API}/jobs/update", json={"id": jid, "cost": 1500})
        assert r.status_code == 200
        fetched = _get_job(client, jid)
        assert fetched["Cost"] == 1500
        assert fetched["Profit"] == 1500
        assert fetched["technician_share"] == 450
        assert fetched["boss_share"] == 1050

    def test_status_only_regression(self, client):
        """Status-only update (Mark Completed) still works"""
        j = _add(client)
        jid = j["ID"]
        r = client.post(f"{API}/jobs/update", json={"id": jid, "status": "Completed"})
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        # tech/boss/profit must NOT be in updated[] since numeric fields untouched
        assert "technician_share" not in body["updated"]
        assert "boss_share" not in body["updated"]
        fetched = _get_job(client, jid)
        assert fetched["Status"] == "Completed"
        assert fetched["completed_date"]
        assert fetched["completed_time"]
        # Earnings preserved
        assert fetched["technician_share"] == 540
        assert fetched["boss_share"] == 1260


class TestLegacyBackwardCompat:
    """Legacy MongoDB rows without technician_share/boss_share must get derived."""

    @pytest.mark.asyncio
    async def test_legacy_row_derivation(self):
        import motor.motor_asyncio
        from dotenv import load_dotenv
        from pathlib import Path
        load_dotenv(Path("/app/backend/.env"))
        mc = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = mc[os.environ["DB_NAME"]]
        legacy_id = "LEGACY01"
        # Insert legacy row (no technician_share/boss_share, only Share)
        await db.jobs.delete_one({"ID": legacy_id})
        await db.jobs.insert_one({
            "ID": legacy_id,
            "Name": "TEST_Legacy",
            "Phone": "9999988888",
            "Model": "Old",
            "Work": "Screen",
            "Cost": 1000,
            "Amount": 3000,
            "Profit": 2000,
            "Percentage": 30,
            "Share": 600,
            "Status": "Pending",
            "received_date": "2026-01-01",
            "received_time": "10:00:00",
            "completed_date": "",
            "completed_time": "",
            "Photo": "",
        })
        r = requests.get(f"{API}/jobs")
        assert r.status_code == 200
        rows = [x for x in r.json() if x["ID"] == legacy_id]
        assert len(rows) == 1
        j = rows[0]
        # derived: tech = Share, boss = Profit - Share
        assert j["technician_share"] == 600
        assert j["boss_share"] == 1400
        # cleanup
        await db.jobs.delete_one({"ID": legacy_id})
        mc.close()
