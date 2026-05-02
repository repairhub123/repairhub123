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
- ✅ **Full earnings distribution** — `technician_share` & `boss_share` computed on every add/update. Technician = Profit × %, Boss = Profit − Technician. Additive columns 17 & 18, original 15 + Photo preserved.
- ✅ **Dashboard (Reports)** — 4 sections: Business Summary (Revenue/Cost/Profit/Jobs), Boss Section (Total Boss Share), Technician Section (Total Technician Share), Completed Jobs Only (Revenue/Profit/Boss/Tech). Period chips Today/Week/Month/All.
- ✅ **Color-coded job card** — Amount, Cost, Profit (green), Technician (orange), Boss (blue); status badge; received/completed timestamps.
- ✅ Top Jobs-page KPIs: Pending, Completed, Profit (done), Boss Share, Technician Share — all completed-only.
- ✅ Edit Job via pencil (re-uses dialog, recomputes earnings).
- ✅ Customer phone photo via Camera/Gallery, thumbnail + lightbox.
- ✅ Add Job dialog: multi-select repair types, description, cost, amount, 30%/40% share (0% also valid now), live Profit/Technician/Boss preview.
- ✅ Search (name/phone/model), All/Pending/Completed tabs.
- ✅ Mark as Completed → POST update → 1s delay → GET refresh.
- ✅ Dark UI, ₹ Indian Rupee formatting, "N/A" fallback, name preserved exactly.
- ✅ Google Apps Script with additive auto-migration (18 columns); MongoDB fallback when URL unset.

## Backlog / Next
- P1: Edit job (amount/cost corrections)
- P1: Daily/monthly revenue report with date filter
- P2: Per-technician share split (>1 partner)
- P2: Print/share invoice
- P2: SMS notification on completion (Twilio)
- P2: CSV export

## Test Credentials
See `/app/memory/test_credentials.md` (no auth).
