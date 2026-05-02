"""Backend tests for Mobile Repair Shop API"""
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


# ===== Health & Config =====
def test_root(client):
    r = client.get(f"{API}/")
    assert r.status_code == 200
    assert "sheet_connected" in r.json()


def test_config_sheet_connected_or_disconnected(client):
    r = client.get(f"{API}/config")
    assert r.status_code == 200
    assert "sheet_connected" in r.json()
    assert isinstance(r.json()["sheet_connected"], bool)


# ===== Jobs list =====
def test_list_jobs_returns_array(client):
    r = client.get(f"{API}/jobs")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ===== Add Job + auto-calc =====
def test_add_job_calculations_30(client):
    payload = {
        "name": "TEST_Ravi Kumar",
        "phone": "9876543210",
        "model": "iPhone 12",
        "work": "Screen, Battery",
        "cost": 1200,
        "amount": 3000,
        "percentage": 30,
    }
    r = client.post(f"{API}/jobs", json=payload)
    assert r.status_code == 200
    j = r.json()
    # 15-field schema check
    expected_keys = {"ID","Name","Phone","Model","Work","Cost","Amount","Profit","Percentage","Share","Status","received_date","received_time","completed_date","completed_time"}
    assert expected_keys.issubset(j.keys())
    assert j["Name"] == "TEST_Ravi Kumar"  # casing preserved
    assert j["Profit"] == 1800
    assert j["Share"] == 540
    assert j["Status"] == "Pending"
    assert j["received_date"] != ""
    assert j["received_time"] != ""
    assert j["completed_date"] == ""
    assert j["completed_time"] == ""
    assert isinstance(j["Cost"], (int, float))
    assert isinstance(j["Name"], str)
    assert j["ID"]


def test_add_job_calculations_40(client):
    payload = {
        "name": "TEST_Suresh",
        "phone": "9000000000",
        "model": "Redmi 9",
        "work": "Battery",
        "cost": 500,
        "amount": 2000,
        "percentage": 40,
    }
    r = client.post(f"{API}/jobs", json=payload)
    assert r.status_code == 200
    j = r.json()
    assert j["Profit"] == 1500
    assert j["Share"] == 600
    assert j["Percentage"] == 40


# ===== Persistence: add then GET =====
def test_add_then_get_persists(client):
    payload = {
        "name": "TEST_PersistUser",
        "phone": "8888888888",
        "model": "Samsung A50",
        "work": "Charging",
        "cost": 100,
        "amount": 500,
        "percentage": 30,
    }
    r = client.post(f"{API}/jobs", json=payload)
    assert r.status_code == 200
    job_id = r.json()["ID"]

    time.sleep(1.1)
    r2 = client.get(f"{API}/jobs")
    assert r2.status_code == 200
    found = [x for x in r2.json() if x["ID"] == job_id]
    assert len(found) == 1
    assert found[0]["Name"] == "TEST_PersistUser"
    assert found[0]["Status"] == "Pending"


# ===== Update / Complete =====
def test_update_job_sets_completed(client):
    add = client.post(f"{API}/jobs", json={
        "name": "TEST_Complete",
        "phone": "7777777777",
        "model": "OnePlus 9",
        "work": "Screen",
        "cost": 2000,
        "amount": 5000,
        "percentage": 30,
    })
    job_id = add.json()["ID"]

    upd = client.post(f"{API}/jobs/update", json={"id": job_id, "status": "Completed"})
    assert upd.status_code == 200
    assert upd.json().get("ok") is True

    time.sleep(0.5)
    listed = client.get(f"{API}/jobs").json()
    found = [x for x in listed if x["ID"] == job_id]
    assert found and found[0]["Status"] == "Completed"
    assert found[0]["completed_date"] != ""
    assert found[0]["completed_time"] != ""
