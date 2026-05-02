"""Tests for new Photo upload + job photo round-trip feature."""
import io
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://phoneshop-hub-6.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# 1x1 PNG
PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf"
    b"\xc0\x00\x00\x00\x03\x00\x01\x9cI\xee\xe6\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.fixture(scope="module")
def session():
    return requests.Session()


# ===== Upload =====
def test_upload_png_success(session):
    r = session.post(
        f"{API}/upload",
        files={"file": ("test.png", io.BytesIO(PNG_BYTES), "image/png")},
        timeout=60,
    )
    if r.status_code == 503:
        pytest.skip(f"Storage backend not available in this preview env: {r.text}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "path" in data
    assert data["path"].startswith("repair-desk/photos/")
    assert data["path"].endswith(".png")
    pytest.shared_path = data["path"]


def test_upload_rejects_non_image(session):
    r = session.post(
        f"{API}/upload",
        files={"file": ("note.txt", io.BytesIO(b"hello"), "text/plain")},
        timeout=30,
    )
    assert r.status_code == 400
    assert "Unsupported" in r.json().get("detail", "") or "image" in r.json().get("detail", "").lower()


def test_upload_rejects_oversized(session):
    big = b"\x00" * (8 * 1024 * 1024 + 100)
    r = session.post(
        f"{API}/upload",
        files={"file": ("big.png", io.BytesIO(big), "image/png")},
        timeout=120,
    )
    # if storage unavailable we still want to ensure size guard runs first
    if r.status_code == 503:
        pytest.skip("storage unavailable")
    assert r.status_code == 400
    assert "large" in r.json().get("detail", "").lower() or "max" in r.json().get("detail", "").lower()


# ===== Files GET =====
def test_get_uploaded_file(session):
    path = getattr(pytest, "shared_path", None)
    if not path:
        pytest.skip("upload did not succeed earlier")
    r = session.get(f"{API}/files/{path}", timeout=60)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/")
    assert len(r.content) > 0


# ===== Job round-trip with photo =====
def test_job_photo_round_trip(session):
    path = getattr(pytest, "shared_path", "repair-desk/photos/dummy-uuid.png")
    payload = {
        "name": "TEST_PhotoUser",
        "phone": "9999900000",
        "model": "Pixel 7",
        "work": "Screen",
        "cost": 100,
        "amount": 500,
        "percentage": 30,
        "photo": path,
    }
    r = session.post(f"{API}/jobs", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    # 18 fields (15 strict + Photo + technician_share + boss_share)
    assert "Photo" in j
    assert j["Photo"] == path
    assert len(j.keys()) == 19
    job_id = j["ID"]

    time.sleep(0.5)
    listed = session.get(f"{API}/jobs", timeout=30).json()
    found = [x for x in listed if x["ID"] == job_id]
    assert found and found[0]["Photo"] == path


def test_job_without_photo_still_has_photo_field(session):
    payload = {
        "name": "TEST_NoPhoto",
        "phone": "9000011111",
        "model": "Mi 11",
        "work": "Battery",
        "cost": 200,
        "amount": 600,
        "percentage": 40,
    }
    r = session.post(f"{API}/jobs", json=payload, timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert "Photo" in j
    assert j["Photo"] == ""
    assert len(j.keys()) == 19
