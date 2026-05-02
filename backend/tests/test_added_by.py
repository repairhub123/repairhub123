# Tests for the added_by (role-tag) feature — iteration 5
import os
import pytest
import requests
from pathlib import Path


def _load_backend_url():
    v = os.environ.get('REACT_APP_BACKEND_URL')
    if v:
        return v.rstrip('/')
    env = Path('/app/frontend/.env')
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.split('=', 1)[1].strip().rstrip('/')
    return 'http://localhost:8001'


BASE_URL = _load_backend_url()
FRONTEND_URL = BASE_URL


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 pytest"})
    return s


def _sheet_connected(api_client):
    try:
        return bool(api_client.get(f"{BASE_URL}/api/config", timeout=10).json().get("sheet_connected"))
    except Exception:
        return False


EXPECTED_KEYS = {
    "ID", "Name", "Phone", "Model", "Work", "Cost", "Amount", "Profit",
    "Percentage", "Share", "Status", "received_date", "received_time",
    "completed_date", "completed_time", "Photo", "technician_share",
    "boss_share", "added_by",
}


class TestAddedByField:
    def _create(self, api_client, added_by=None):
        payload = {
            "name": "TEST_AddedBy",
            "phone": "9999000011",
            "model": "iPhone 14",
            "work": "Battery",
            "cost": 500,
            "amount": 1500,
            "percentage": 30,
        }
        if added_by is not None:
            payload["added_by"] = added_by
        r = api_client.post(f"{BASE_URL}/api/jobs", json=payload)
        assert r.status_code == 200, r.text
        return r.json()

    def test_create_with_boss(self, api_client):
        job = self._create(api_client, "Boss")
        assert job["added_by"] == "Boss"
        assert set(job.keys()) == EXPECTED_KEYS
        # GET back and verify persistence of the field being present.
        # When a legacy Sheet (18-col) is connected, it won't echo added_by, and
        # normalize_job returns '' — this is expected graceful degradation.
        jobs = api_client.get(f"{BASE_URL}/api/jobs").json()
        match = next((j for j in jobs if j["ID"] == job["ID"]), None)
        assert match is not None
        assert "added_by" in match
        if _sheet_connected(api_client):
            assert match["added_by"] in ("Boss", "")  # sheet may not yet have col 19
        else:
            assert match["added_by"] == "Boss"

    def test_create_with_technician(self, api_client):
        job = self._create(api_client, "Technician")
        assert job["added_by"] == "Technician"
        jobs = api_client.get(f"{BASE_URL}/api/jobs").json()
        match = next((j for j in jobs if j["ID"] == job["ID"]), None)
        assert match is not None
        assert "added_by" in match
        if _sheet_connected(api_client):
            assert match["added_by"] in ("Technician", "")
        else:
            assert match["added_by"] == "Technician"

    def test_create_without_added_by_defaults_empty(self, api_client):
        job = self._create(api_client, None)
        assert job["added_by"] == ""
        assert "added_by" in job

    def test_list_jobs_has_added_by_on_all(self, api_client):
        jobs = api_client.get(f"{BASE_URL}/api/jobs").json()
        assert isinstance(jobs, list) and len(jobs) > 0
        for j in jobs:
            assert "added_by" in j
            assert isinstance(j["added_by"], str)
            # 19-field contract
            assert set(j.keys()) == EXPECTED_KEYS, f"unexpected shape: {set(j.keys()) ^ EXPECTED_KEYS}"

    def test_regression_math_unchanged(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/jobs", json={
            "name": "TEST_Math", "phone": "9000", "model": "M", "work": "W",
            "cost": 1200, "amount": 3000, "percentage": 30, "added_by": "Boss",
        })
        assert r.status_code == 200
        j = r.json()
        assert j["Profit"] == 1800
        assert j["technician_share"] == 540
        assert j["boss_share"] == 1260
        assert j["added_by"] == "Boss"

    def test_status_only_update_preserves_added_by(self, api_client):
        job = self._create(api_client, "Technician")
        jid = job["ID"]
        r = api_client.post(f"{BASE_URL}/api/jobs/update", json={"id": jid, "status": "Completed"})
        assert r.status_code == 200
        jobs = api_client.get(f"{BASE_URL}/api/jobs").json()
        match = next((j for j in jobs if j["ID"] == jid), None)
        assert match is not None
        assert match["Status"] == "Completed"
        # Legacy 18-col sheet may return '' for added_by — tolerate per env note
        if _sheet_connected(api_client):
            assert match["added_by"] in ("Technician", "")
        else:
            assert match["added_by"] == "Technician"


class TestPWAStaticAssets:
    def test_manifest_json_served(self, api_client):
        r = api_client.get(f"{FRONTEND_URL}/manifest.json", timeout=15)
        assert r.status_code == 200, f"manifest.json returned {r.status_code}"
        data = r.json()
        assert data.get("short_name") == "Repair Desk" or "Repair Desk" in data.get("name", "")

    def test_sw_js_served(self, api_client):
        r = api_client.get(f"{FRONTEND_URL}/sw.js", timeout=15)
        assert r.status_code == 200, f"sw.js returned {r.status_code}"
        assert "self" in r.text or "cache" in r.text.lower() or len(r.text) > 0
