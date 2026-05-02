from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
import uuid
from datetime import datetime
import requests
from zoneinfo import ZoneInfo

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

SHEET_URL = os.environ.get('GOOGLE_SHEET_WEBAPP_URL', '').strip()
EMERGENT_KEY = os.environ.get('EMERGENT_LLM_KEY', '').strip()
APP_NAME = os.environ.get('APP_NAME', 'repair-desk').strip()
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
IST = ZoneInfo("Asia/Kolkata")

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============== STORAGE ==============
_storage_key: Optional[str] = None


def init_storage() -> Optional[str]:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_KEY:
        return None
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        r.raise_for_status()
        _storage_key = r.json()["storage_key"]
        return _storage_key
    except Exception as e:
        logger.error(f"storage init failed: {e}")
        return None


def put_object(path: str, data: bytes, content_type: str) -> Dict[str, Any]:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage not available")
    r = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    r.raise_for_status()
    return r.json()


def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage not available")
    r = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60,
    )
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


# ============== MODELS ==============
class JobCreate(BaseModel):
    name: str
    phone: str
    model: str
    work: str
    cost: float = 0
    amount: float = 0
    percentage: float = 30
    photo: Optional[str] = ""  # storage path, e.g. "repair-desk/photos/<uuid>.jpg"


class JobUpdate(BaseModel):
    id: str
    # Completion fields
    status: Optional[str] = None
    completed_date: Optional[str] = None
    completed_time: Optional[str] = None
    # Editable fields (all optional; only non-None ones are applied)
    name: Optional[str] = None
    phone: Optional[str] = None
    model: Optional[str] = None
    work: Optional[str] = None
    cost: Optional[float] = None
    amount: Optional[float] = None
    percentage: Optional[float] = None
    photo: Optional[str] = None


# ============== HELPERS ==============
def now_date() -> str:
    return datetime.now(IST).strftime("%Y-%m-%d")


def now_time() -> str:
    return datetime.now(IST).strftime("%H:%M:%S")


def to_num(v: Any) -> float:
    if v is None or v == "":
        return 0.0
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


_ISO_DT_RE = __import__("re").compile(r"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$")


def _parse_iso_to_ist(s: str) -> Optional[datetime]:
    """Parse an ISO datetime string coming from Google Sheets and return an IST-aware datetime.
    Google Sheets stores date/time cell values as Date objects; when serialized they come as
    UTC-based ISO strings (ending in 'Z'). We shift them into IST so the user-facing date/time
    matches what was written."""
    if not s:
        return None
    m = _ISO_DT_RE.match(s)
    if not m:
        return None
    try:
        # Normalise to Python-parsable ISO with explicit Z handling
        base = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(base)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=ZoneInfo("UTC"))
        return dt.astimezone(IST)
    except (ValueError, TypeError):
        return None


def normalize_date(v: Any) -> str:
    """Accepts plain 'YYYY-MM-DD' or ISO datetime (from Google Sheet date cells) →
    returns plain 'YYYY-MM-DD' in IST. Empty/None → ''."""
    if v is None or v == "":
        return ""
    s = str(v).strip()
    if not s:
        return ""
    ist_dt = _parse_iso_to_ist(s)
    if ist_dt is not None:
        return ist_dt.strftime("%Y-%m-%d")
    # Already a plain date string
    return s[:10] if len(s) >= 10 and s[4] == "-" and s[7] == "-" else s


def normalize_time(v: Any) -> str:
    """Accepts 'HH:MM[:SS]' or ISO datetime (from Google Sheet time cells, base 1899-12-30) →
    returns 'HH:MM:SS' in IST."""
    if v is None or v == "":
        return ""
    s = str(v).strip()
    if not s:
        return ""
    ist_dt = _parse_iso_to_ist(s)
    if ist_dt is not None:
        return ist_dt.strftime("%H:%M:%S")
    if len(s) == 5 and s[2] == ":":
        return s + ":00"
    return s


def normalize_job(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ensure every job has the 15 strict fields + Photo (col 16) +
    technician_share (col 17) + boss_share (col 18). All additive — the
    original 15 column order and names are preserved.

    technician_share is the same value as Share (the existing column);
    boss_share = Profit - technician_share. Both are recomputed from
    Profit & Share if the row is missing them (backward compat).
    """
    profit = to_num(row.get("Profit"))
    share = to_num(row.get("Share"))
    tech = row.get("technician_share")
    tech_val = to_num(tech) if tech not in (None, "") else share
    boss = row.get("boss_share")
    boss_val = to_num(boss) if boss not in (None, "") else round(profit - tech_val, 2)
    return {
        "ID": str(row.get("ID", "") or ""),
        "Name": str(row.get("Name", "") or ""),
        "Phone": str(row.get("Phone", "") or ""),
        "Model": str(row.get("Model", "") or ""),
        "Work": str(row.get("Work", "") or ""),
        "Cost": to_num(row.get("Cost")),
        "Amount": to_num(row.get("Amount")),
        "Profit": profit,
        "Percentage": to_num(row.get("Percentage")),
        "Share": share,
        "Status": str(row.get("Status", "") or "Pending"),
        "received_date": normalize_date(row.get("received_date")),
        "received_time": normalize_time(row.get("received_time")),
        "completed_date": normalize_date(row.get("completed_date")),
        "completed_time": normalize_time(row.get("completed_time")),
        "Photo": str(row.get("Photo", "") or ""),
        "technician_share": tech_val,
        "boss_share": boss_val,
    }


# ============== SHEET PROXY ==============
def sheet_get() -> List[Dict[str, Any]]:
    if not SHEET_URL:
        return None
    try:
        r = requests.get(SHEET_URL, timeout=20)
        r.raise_for_status()
        data = r.json()
        if isinstance(data, dict) and "jobs" in data:
            return data["jobs"]
        if isinstance(data, list):
            return data
        return []
    except Exception as e:
        logger.error(f"sheet_get failed: {e}")
        raise HTTPException(status_code=502, detail=f"Google Sheet fetch failed: {e}")


def sheet_post(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not SHEET_URL:
        return None
    try:
        r = requests.post(
            SHEET_URL,
            data=json.dumps(payload),
            headers={"Content-Type": "application/json"},
            timeout=20,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.error(f"sheet_post failed: {e}")
        raise HTTPException(status_code=502, detail=f"Google Sheet write failed: {e}")


# ============== ROUTES ==============
@api_router.get("/")
async def root():
    return {"message": "Mobile Repair Shop API", "sheet_connected": bool(SHEET_URL)}


@api_router.get("/config")
async def get_config():
    return {"sheet_connected": bool(SHEET_URL)}


@api_router.get("/jobs")
async def list_jobs():
    if SHEET_URL:
        rows = sheet_get()
        return [normalize_job(r) for r in (rows or [])]
    rows = await db.jobs.find({}, {"_id": 0}).to_list(5000)
    return [normalize_job(r) for r in rows]


@api_router.post("/jobs")
async def add_job(job: JobCreate):
    job_id = str(uuid.uuid4())[:8].upper()
    cost = to_num(job.cost)
    amount = to_num(job.amount)
    percentage = to_num(job.percentage) if job.percentage is not None else 30
    profit = amount - cost
    technician_share = round(profit * (percentage / 100.0), 2)
    boss_share = round(profit - technician_share, 2)

    record = {
        "ID": job_id,
        "Name": job.name.strip(),
        "Phone": job.phone.strip(),
        "Model": job.model.strip(),
        "Work": job.work.strip(),
        "Cost": cost,
        "Amount": amount,
        "Profit": profit,
        "Percentage": percentage,
        "Share": technician_share,
        "Status": "Pending",
        "received_date": now_date(),
        "received_time": now_time(),
        "completed_date": "",
        "completed_time": "",
        "Photo": (job.photo or "").strip(),
        "technician_share": technician_share,
        "boss_share": boss_share,
    }

    if SHEET_URL:
        sheet_post({"action": "add", **record})
    else:
        await db.jobs.insert_one(record.copy())

    return normalize_job(record)


@api_router.post("/jobs/update")
async def update_job(upd: JobUpdate):
    # Read existing record (from sheet or mongo) so we can recompute Profit/Share correctly
    existing: Optional[Dict[str, Any]] = None
    if SHEET_URL:
        rows = sheet_get() or []
        for r in rows:
            if str(r.get("ID", "")) == str(upd.id):
                existing = normalize_job(r)
                break
    else:
        doc = await db.jobs.find_one({"ID": upd.id}, {"_id": 0})
        if doc:
            existing = normalize_job(doc)

    if existing is None:
        raise HTTPException(status_code=404, detail="Job not found")

    # Build the set of field updates
    updates: Dict[str, Any] = {}

    # Mark-completed shortcut: caller passed status without the other fields
    if upd.status is not None:
        updates["Status"] = upd.status
    if upd.completed_date is not None:
        updates["completed_date"] = upd.completed_date
    if upd.completed_time is not None:
        updates["completed_time"] = upd.completed_time
    # If marking completed and no explicit completed_date/time, auto-stamp
    if upd.status == "Completed" and upd.completed_date is None:
        updates["completed_date"] = now_date()
    if upd.status == "Completed" and upd.completed_time is None:
        updates["completed_time"] = now_time()

    # Editable string fields
    for src, dst in [("name", "Name"), ("phone", "Phone"), ("model", "Model"),
                     ("work", "Work"), ("photo", "Photo")]:
        v = getattr(upd, src)
        if v is not None:
            updates[dst] = v.strip() if isinstance(v, str) else v

    # Editable numeric fields — recompute Profit/Share + boss_share when any changes
    numeric_changed = any(getattr(upd, k) is not None for k in ("cost", "amount", "percentage"))
    if numeric_changed:
        new_cost = to_num(upd.cost if upd.cost is not None else existing["Cost"])
        new_amount = to_num(upd.amount if upd.amount is not None else existing["Amount"])
        new_pct = to_num(upd.percentage if upd.percentage is not None else existing["Percentage"]) or 30
        new_profit = new_amount - new_cost
        new_tech = round(new_profit * (new_pct / 100.0), 2)
        new_boss = round(new_profit - new_tech, 2)
        updates.update({
            "Cost": new_cost,
            "Amount": new_amount,
            "Percentage": new_pct,
            "Profit": new_profit,
            "Share": new_tech,
            "technician_share": new_tech,
            "boss_share": new_boss,
        })

    if not updates:
        return {"ok": True, "id": upd.id, "unchanged": True}

    if SHEET_URL:
        sheet_post({"action": "update", "id": upd.id, **updates})
    else:
        await db.jobs.update_one({"ID": upd.id}, {"$set": updates})

    return {"ok": True, "id": upd.id, "updated": list(updates.keys())}


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"}
EXT_BY_TYPE = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
    "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
}


@api_router.post("/upload")
async def upload(file: UploadFile = File(...)):
    ct = (file.content_type or "").lower()
    if ct not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {ct}")
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 8MB)")

    ext = EXT_BY_TYPE.get(ct, "jpg")
    path = f"{APP_NAME}/photos/{uuid.uuid4()}.{ext}"
    result = put_object(path, data, ct)
    stored_path = result.get("path", path)

    await db.files.insert_one({
        "id": str(uuid.uuid4()),
        "storage_path": stored_path,
        "content_type": ct,
        "size": result.get("size", len(data)),
        "created_at": datetime.now(IST).isoformat(),
    })
    return {"path": stored_path}


@api_router.get("/files/{path:path}")
async def download_file(path: str):
    record = await db.files.find_one({"storage_path": path}, {"_id": 0})
    if not record:
        # still try to fetch — file might have been uploaded to the sheet externally
        pass
    try:
        data, content_type = get_object(path)
    except requests.HTTPError as e:
        code = e.response.status_code if e.response is not None else 500
        raise HTTPException(status_code=404 if code == 404 else 502, detail="File not found")
    return Response(content=data, media_type=(record or {}).get("content_type", content_type))


@app.on_event("startup")
async def startup():
    key = init_storage()
    logger.info(f"Storage initialized: {bool(key)}")


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
