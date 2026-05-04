from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
import base64
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
IMGBB_KEY = os.environ.get('IMGBB_API_KEY', '').strip()
IST = ZoneInfo("Asia/Kolkata")

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class JobCreate(BaseModel):
    name: str
    phone: str
    model: str
    work: str
    cost: float = 0
    amount: float = 0
    percentage: float = 30
    photo: Optional[str] = ""
    added_by: Optional[str] = ""

class JobUpdate(BaseModel):
    id: str
    status: Optional[str] = None
    completed_date: Optional[str] = None
    completed_time: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    model: Optional[str] = None
    work: Optional[str] = None
    cost: Optional[float] = None
    amount: Optional[float] = None
    percentage: Optional[float] = None
    photo: Optional[str] = None

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
    if not s:
        return None
    m = _ISO_DT_RE.match(s)
    if not m:
        return None
    try:
        base = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(base)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=ZoneInfo("UTC"))
        return dt.astimezone(IST)
    except (ValueError, TypeError):
        return None

def normalize_date(v: Any) -> str:
    if v is None or v == "":
        return ""
    s = str(v).strip()
    if not s:
        return ""
    ist_dt = _parse_iso_to_ist(s)
    if ist_dt is not None:
        return ist_dt.strftime("%Y-%m-%d")
    return s[:10] if len(s) >= 10 and s[4] == "-" and s[7] == "-" else s

def normalize_time(v: Any) -> str:
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
        "added_by": str(row.get("added_by", "") or ""),
    }

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
        "added_by": (job.added_by or "").strip(),
    }
    if SHEET_URL:
        sheet_post({"action": "add", **record})
    else:
        await db.jobs.insert_one(record.copy())
    return normalize_job(record)

@api_router.post("/jobs/update")
async def update_job(upd: JobUpdate):
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
    updates: Dict[str, Any] = {}
    if upd.status is not None:
        updates["Status"] = upd.status
    if upd.completed_date is not None:
        updates["completed_date"] = upd.completed_date
    if upd.completed_time is not None:
        updates["completed_time"] = upd.completed_time
    if upd.status == "Completed" and upd.completed_date is None:
        updates["completed_date"] = now_date()
    if upd.status == "Completed" and upd.completed_time is None:
        updates["completed_time"] = now_time()
    for src, dst in [("name", "Name"), ("phone", "Phone"), ("model", "Model"),
                     ("work", "Work"), ("photo", "Photo")]:
        v = getattr(upd, src)
        if v is not None:
            updates[dst] = v.strip() if isinstance(v, str) else v
    numeric_changed = any(getattr(upd, k) is not None for k in ("cost", "amount", "percentage"))
    if numeric_changed:
        new_cost = to_num(upd.cost if upd.cost is not None else existing["Cost"])
        new_amount = to_num(upd.amount if upd.amount is not None else existing["Amount"])
        new_pct = to_num(upd.percentage if upd.percentage is not None else existing["Percentage"]) or 30
        new_profit = new_amount - new_cost
        new_tech = round(new_profit * (new_pct / 100.0), 2)
        new_boss = round(new_profit - new_tech, 2)
        updates.update({
            "Cost": new_cost, "Amount": new_amount, "Percentage": new_pct,
            "Profit": new_profit, "Share": new_tech,
            "technician_share": new_tech, "boss_share": new_boss,
        })
    if not updates:
        return {"ok": True, "id": upd.id, "unchanged": True}
    if SHEET_URL:
        sheet_post({"action": "update", "id": upd.id, **updates})
    else:
        await db.jobs.update_one({"ID": upd.id}, {"$set": updates})
    return {"ok": True, "id": upd.id, "updated": list(updates.keys())}

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"}

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
    if not IMGBB_KEY:
        raise HTTPException(status_code=503, detail="Image upload not configured")
    b64 = base64.b64encode(data).decode('utf-8')
    r = requests.post(
        "https://api.imgbb.com/1/upload",
        data={"key": IMGBB_KEY, "image": b64},
        timeout=30
    )
    r.raise_for_status()
    url = r.json()["data"]["url"]
    return {"path": url}

@app.on_event("startup")
async def startup():
    logger.info("Server started")

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
