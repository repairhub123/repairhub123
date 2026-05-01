from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
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
IST = ZoneInfo("Asia/Kolkata")

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ============== MODELS ==============
class JobCreate(BaseModel):
    name: str
    phone: str
    model: str
    work: str
    cost: float = 0
    amount: float = 0
    percentage: float = 30


class JobUpdate(BaseModel):
    id: str
    status: Optional[str] = None
    completed_date: Optional[str] = None
    completed_time: Optional[str] = None


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


def normalize_job(row: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure every job has all 15 fields with correct types."""
    return {
        "ID": str(row.get("ID", "") or ""),
        "Name": str(row.get("Name", "") or ""),
        "Phone": str(row.get("Phone", "") or ""),
        "Model": str(row.get("Model", "") or ""),
        "Work": str(row.get("Work", "") or ""),
        "Cost": to_num(row.get("Cost")),
        "Amount": to_num(row.get("Amount")),
        "Profit": to_num(row.get("Profit")),
        "Percentage": to_num(row.get("Percentage")),
        "Share": to_num(row.get("Share")),
        "Status": str(row.get("Status", "") or "Pending"),
        "received_date": str(row.get("received_date", "") or ""),
        "received_time": str(row.get("received_time", "") or ""),
        "completed_date": str(row.get("completed_date", "") or ""),
        "completed_time": str(row.get("completed_time", "") or ""),
    }


# ============== GOOGLE SHEET PROXY ==============
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
            data=__import__("json").dumps(payload),
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
    # MongoDB fallback
    rows = await db.jobs.find({}, {"_id": 0}).to_list(5000)
    return [normalize_job(r) for r in rows]


@api_router.post("/jobs")
async def add_job(job: JobCreate):
    job_id = str(uuid.uuid4())[:8].upper()
    cost = to_num(job.cost)
    amount = to_num(job.amount)
    percentage = to_num(job.percentage) or 30
    profit = amount - cost
    share = round(profit * (percentage / 100.0), 2)

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
        "Share": share,
        "Status": "Pending",
        "received_date": now_date(),
        "received_time": now_time(),
        "completed_date": "",
        "completed_time": "",
    }

    if SHEET_URL:
        sheet_post({"action": "add", **record})
    else:
        await db.jobs.insert_one(record.copy())

    return normalize_job(record)


@api_router.post("/jobs/update")
async def update_job(upd: JobUpdate):
    payload = {
        "action": "update",
        "id": upd.id,
        "status": upd.status or "Completed",
        "completed_date": upd.completed_date or now_date(),
        "completed_time": upd.completed_time or now_time(),
    }

    if SHEET_URL:
        sheet_post(payload)
    else:
        await db.jobs.update_one(
            {"ID": upd.id},
            {"$set": {
                "Status": payload["status"],
                "completed_date": payload["completed_date"],
                "completed_time": payload["completed_time"],
            }},
        )
    return {"ok": True, **payload}


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
