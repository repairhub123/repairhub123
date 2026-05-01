# Mobile Repair Shop Management App — PRD

## Problem Statement
Build a complete mobile repair shop management app connected to Google Sheets via API with a strict 15-column data structure, POST/GET JSON API, automatic profit/share calculation, and zero data loss with 1s sync after every write.

## Architecture
- **Frontend**: React (craco) + Tailwind + shadcn/ui — dark mobile-first UI at `/app/frontend/src/pages/RepairShop.jsx`
- **Backend**: FastAPI at `/app/backend/server.py` — proxies to Google Apps Script Web App when `GOOGLE_SHEET_WEBAPP_URL` is set, falls back to MongoDB otherwise (so app is fully functional even before sheet setup)
- **Google Apps Script**: Ready-to-deploy code at `/app/google_apps_script.gs`
- **Time zone**: Asia/Kolkata (IST) for received/completed timestamps

## 15-Column Data Contract (strict order)
ID, Name, Phone, Model, Work, Cost, Amount, Profit, Percentage, Share, Status, received_date, received_time, completed_date, completed_time

## API
- `GET  /api/jobs` — returns array of normalized 15-field jobs
- `POST /api/jobs` — add (body: name, phone, model, work, cost, amount, percentage)
- `POST /api/jobs/update` — update (body: id, status, completed_date?, completed_time?)
- `GET  /api/config` — `{ sheet_connected: bool }`

## Implemented (Feb 2026)
- ✅ Add Job dialog: multi-select repair type chips, description, cost, amount, 30%/40% share
- ✅ **Customer phone photo** via Camera or Gallery (Emergent Object Storage), thumbnail on job card, tap to zoom lightbox
- ✅ Auto Profit = Amount − Cost, Share = Profit × %/100, live preview in dialog
- ✅ Auto received_date/time (IST), Status=Pending
- ✅ Job list with All/Pending/Completed tabs
- ✅ Search (name/phone/model)
- ✅ Mark as Completed button → POST update → 1s delay → GET refresh
- ✅ KPIs: Pending count, Completed count, Total Share (₹)
- ✅ Dark UI with acid-lime accent, Indian Rupee formatting (₹1,200)
- ✅ "N/A" for missing fields
- ✅ Name preserved exactly (no "Customer" fallback)
- ✅ Google Apps Script — paste & deploy; backend picks up via `GOOGLE_SHEET_WEBAPP_URL`
- ✅ MongoDB fallback so app is usable from day 1
- ✅ Sheet schema: 15 strict columns + Photo as additive column 16 (no reorder/rename)

## Backlog / Next
- P1: Edit job (amount/cost corrections)
- P1: Daily/monthly revenue report with date filter
- P2: Per-technician share split (>1 partner)
- P2: Print/share invoice
- P2: SMS notification on completion (Twilio)
- P2: CSV export

## Test Credentials
See `/app/memory/test_credentials.md` (no auth).
