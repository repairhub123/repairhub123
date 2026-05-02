"""Backend tests for Edit Job (P1) and Reports data regression"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://phoneshop-hub-6.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _add(client, **overrides):
    payload = {
        "name": "TEST_Edit",
        "phone": "9999911111",
        "model": "iPhone 13",
        "work": "Screen",
        "cost": 1000,
        "amount": 3000,
        "percentage": 30,
    }
    payload.update(overrides)
    r = client.post(f"{API}/jobs", json=payload)
    assert r.status_code == 200
    return r.json()


def _get_job(client, job_id):
    r = client.get(f"{API}/jobs")
    assert r.status_code == 200
    for j in r.json():
        if j["ID"] == job_id:
            return j
    return None


# ===== 16 normalized fields on GET =====
def test_list_jobs_returns_16_fields(client):
    _add(client, name="TEST_FieldsCheck")
    time.sleep(0.7)
    r = client.get(f"{API}/jobs")
    assert r.status_code == 200
    arr = r.json()
    assert isinstance(arr, list) and len(arr) >= 1
    expected = {"ID","Name","Phone","Model","Work","Cost","Amount","Profit","Percentage",
                "Share","Status","received_date","received_time","completed_date","completed_time","Photo"}
    assert set(arr[0].keys()) == expected
    assert len(arr[0].keys()) == 16


# ===== Edit Job: all editable fields =====
def test_update_editable_fields_returns_updated_list(client):
    created = _add(client, name="TEST_EditAll", cost=500, amount=2000, percentage=30)
    jid = created["ID"]

    patch = {
        "id": jid,
        "name": "TEST_EditAll_v2",
        "phone": "9111100000",
        "model": "iPhone 14",
        "work": "Battery — swap",
        "cost": 800,
        "amount": 2500,
        "percentage": 40,
        "photo": "repair-desk/photos/fake.jpg",
    }
    r = client.post(f"{API}/jobs/update", json=patch)
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True
    assert body.get("id") == jid
    assert isinstance(body.get("updated"), list)
    # must report the editable keys that actually changed (server-side keys)
    for k in ["Name","Phone","Model","Work","Cost","Amount","Percentage","Photo","Profit","Share"]:
        assert k in body["updated"], f"{k} missing in updated list"

    time.sleep(0.7)
    j = _get_job(client, jid)
    assert j is not None
    assert j["Name"] == "TEST_EditAll_v2"
    assert j["Phone"] == "9111100000"
    assert j["Model"] == "iPhone 14"
    assert j["Work"] == "Battery — swap"
    assert j["Cost"] == 800
    assert j["Amount"] == 2500
    assert j["Percentage"] == 40
    # Recomputed server-side
    assert j["Profit"] == 1700
    assert j["Share"] == 680.0
    assert j["Photo"] == "repair-desk/photos/fake.jpg"


# ===== Edit Job: numeric-only triggers recompute =====
def test_update_numeric_only_recomputes_profit_share(client):
    created = _add(client, name="TEST_Numeric", cost=1000, amount=3000, percentage=30)
    jid = created["ID"]

    r = client.post(f"{API}/jobs/update", json={"id": jid, "amount": 5000})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    for k in ["Amount","Profit","Share","Cost","Percentage"]:
        assert k in body["updated"]

    time.sleep(0.7)
    j = _get_job(client, jid)
    assert j["Amount"] == 5000
    assert j["Cost"] == 1000
    assert j["Profit"] == 4000
    assert j["Share"] == 1200.0
    assert j["Status"] == "Pending"  # unchanged


# ===== Edit Job: non-existent ID =====
def test_update_nonexistent_returns_404(client):
    r = client.post(f"{API}/jobs/update", json={"id": "DOESNTEXIST123", "amount": 100})
    assert r.status_code == 404
    assert r.json().get("detail") == "Job not found"


# ===== Mark completed regression =====
def test_update_status_only_marks_completed_with_ist_stamps(client):
    created = _add(client, name="TEST_CompleteRegression")
    jid = created["ID"]

    r = client.post(f"{API}/jobs/update", json={"id": jid, "status": "Completed"})
    assert r.status_code == 200
    assert r.json().get("ok") is True

    time.sleep(0.7)
    j = _get_job(client, jid)
    assert j["Status"] == "Completed"
    assert j["completed_date"] != ""
    assert j["completed_time"] != ""
    # Basic IST date shape YYYY-MM-DD
    assert len(j["completed_date"]) == 10
    assert j["completed_date"][4] == "-" and j["completed_date"][7] == "-"


# ===== No changes: unchanged:true =====
def test_update_with_only_id_returns_unchanged(client):
    created = _add(client, name="TEST_Unchanged")
    jid = created["ID"]

    r = client.post(f"{API}/jobs/update", json={"id": jid})
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True
    assert body.get("unchanged") is True


# ===== Edit a completed job preserves timestamps/status =====
def test_edit_completed_job_preserves_status_and_timestamps(client):
    created = _add(client, name="TEST_EditCompleted", cost=100, amount=1000, percentage=30)
    jid = created["ID"]

    # Complete it
    r = client.post(f"{API}/jobs/update", json={"id": jid, "status": "Completed"})
    assert r.status_code == 200
    time.sleep(0.7)
    before = _get_job(client, jid)
    assert before["Status"] == "Completed"
    cd, ct = before["completed_date"], before["completed_time"]
    rd, rt = before["received_date"], before["received_time"]

    # Edit amount only — should not clear completion
    r = client.post(f"{API}/jobs/update", json={"id": jid, "amount": 1500})
    assert r.status_code == 200
    time.sleep(0.7)
    after = _get_job(client, jid)
    assert after["Status"] == "Completed"
    assert after["completed_date"] == cd
    assert after["completed_time"] == ct
    assert after["received_date"] == rd
    assert after["received_time"] == rt
    assert after["Amount"] == 1500
    assert after["Profit"] == 1400
    assert after["Share"] == 420.0
