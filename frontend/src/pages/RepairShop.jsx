import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  Plus, Search, Wrench, Loader2, RefreshCw, Crown, User, LogOut,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchJobs, markCompleted, fetchConfig,
  formatINR, display, delay,
} from "@/lib/api";
import JobDialog from "@/components/JobDialog";
import JobCard from "@/components/JobCard";
import Reports from "@/components/Reports";
import TodayStats from "@/components/TodayStats";
import CustomerHistory from "@/components/CustomerHistory";

const TABS = ["All", "Pending", "Completed"];
const POLL_MS = 10000;

export default function RepairShop({ role, onSwitchRole }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState("jobs");
  const [tab, setTab] = useState("All");
  const [scope, setScope] = useState("all"); // "all" | "mine"
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [sheetConnected, setSheetConnected] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [historyPhone, setHistoryPhone] = useState(null);

  const refresh = useCallback(async (showSpinner = false) => {
    if (showSpinner) setSyncing(true);
    try {
      const data = await fetchJobs();
      setJobs(data);
    } catch (e) {
      console.error(e);
      if (showSpinner) toast.error("Failed to fetch jobs");
    } finally {
      if (showSpinner) setSyncing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const cfg = await fetchConfig();
        setSheetConnected(cfg.sheet_connected);
      } catch {
        setSheetConnected(false);
      }
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  // Live poll every POLL_MS so the other user's changes show up
  useEffect(() => {
    if (dialogOpen || historyPhone) return; // pause polling while a modal is open
    const id = setInterval(() => refresh(false), POLL_MS);
    return () => clearInterval(id);
  }, [refresh, dialogOpen, historyPhone]);

  // Pull-to-refresh (touch)
  const pullRef = useRef({ startY: 0, armed: false });
  useEffect(() => {
    const onStart = (e) => {
      if (window.scrollY <= 0) {
        pullRef.current = { startY: e.touches[0].clientY, armed: true };
      }
    };
    const onEnd = async (e) => {
      const { startY, armed } = pullRef.current;
      if (!armed) return;
      const endY = (e.changedTouches && e.changedTouches[0]?.clientY) || startY;
      pullRef.current.armed = false;
      if (endY - startY > 80) await refresh(true);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [refresh]);

  const syncAfterWrite = async () => {
    await delay(1000);
    await refresh(false);
  };

  const handleSaved = async () => {
    toast.success(editingJob ? "Job updated" : "Job added");
    setEditingJob(null);
    await syncAfterWrite();
  };

  const handleComplete = async (id) => {
    setBusyId(id);
    try {
      await markCompleted(id);
      toast.success("Marked completed");
      await syncAfterWrite();
    } catch {
      toast.error("Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const openAdd = () => { setEditingJob(null); setDialogOpen(true); };
  const openEdit = (job) => { setEditingJob(job); setDialogOpen(true); };
  const openCustomer = (phone) => phone && setHistoryPhone(phone);

  const visibleJobs = useMemo(() => {
    if (scope === "mine" && role) {
      return jobs.filter((j) => (j.added_by || "") === role);
    }
    return jobs;
  }, [jobs, scope, role]);

  const filtered = useMemo(() => {
    let list = visibleJobs;
    if (tab === "Pending") list = list.filter((j) => j.Status !== "Completed");
    if (tab === "Completed") list = list.filter((j) => j.Status === "Completed");
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (j) =>
          (j.Name || "").toLowerCase().includes(q) ||
          (j.Phone || "").toLowerCase().includes(q) ||
          (j.Model || "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (a.Status !== b.Status) return a.Status === "Completed" ? 1 : -1;
      return (
        (b.received_date + " " + b.received_time).localeCompare(
          a.received_date + " " + a.received_time
        )
      );
    });
  }, [visibleJobs, tab, query]);

  const totals = useMemo(() => {
    const pending = jobs.filter((j) => j.Status !== "Completed").length;
    const completedJobs = jobs.filter((j) => j.Status === "Completed");
    const sum = (k) => completedJobs.reduce((s, j) => s + Number(j[k] || 0), 0);
    return {
      pending,
      completed: completedJobs.length,
      profit: sum("Profit"),
      boss: sum("boss_share"),
      technician: sum("technician_share"),
    };
  }, [jobs]);

  const isBoss = role === "Boss";
  const primaryShareLabel = isBoss ? "Boss Share" : "Technician Share";
  const primaryShareValue = isBoss ? totals.boss : totals.technician;

  return (
    <div className="shell" data-testid="app-shell">
      <header className="header">
        <div className="brand">
          <div className="brand-mark">
            <Wrench size={18} />
          </div>
          <div>
            <h1>Repair Desk</h1>
            <small>mobile repair shop</small>
          </div>
        </div>
        <div className="header-right">
          <button
            type="button"
            className={`role-chip ${isBoss ? "boss" : "tech"}`}
            onClick={onSwitchRole}
            data-testid="role-chip"
            title="Change role"
          >
            {isBoss ? <Crown size={12} /> : <User size={12} />}
            {role}
            <LogOut size={10} style={{ opacity: 0.6 }} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => refresh(true)}
            data-testid="btn-refresh"
            aria-label="Refresh"
          >
            <RefreshCw size={14} className={syncing ? "spin" : ""} />
          </button>
        </div>
      </header>

      <div className="sheet-status-row mono" data-testid="sheet-status">
        {sheetConnected === null ? "…" : sheetConnected ? "● SHEET LIVE" : "● LOCAL MODE"}
        {syncing && <span style={{ marginLeft: 8, color: "var(--muted)" }}>syncing…</span>}
      </div>

      {sheetConnected === false && (
        <div className="toast-banner warn" data-testid="local-mode-banner">
          Running in local mode. Set GOOGLE_SHEET_WEBAPP_URL in backend/.env to sync.
        </div>
      )}

      <div className="view-switch" data-testid="view-switch">
        <button
          data-testid="view-jobs"
          className={`vbtn ${view === "jobs" ? "active" : ""}`}
          onClick={() => setView("jobs")}
        >Jobs</button>
        <button
          data-testid="view-reports"
          className={`vbtn ${view === "reports" ? "active" : ""}`}
          onClick={() => setView("reports")}
        >Reports</button>
      </div>

      {view === "jobs" ? (
        <>
          <TodayStats jobs={jobs} role={role} />

          <div className="kpis" data-testid="kpis">
            <div className="kpi warn" data-testid="kpi-pending">
              <div className="label">Pending</div>
              <div className="value">{totals.pending}</div>
            </div>
            <div className="kpi" data-testid="kpi-completed">
              <div className="label">Completed</div>
              <div className="value">{totals.completed}</div>
            </div>
            <div
              className={`kpi ${isBoss ? "kpi-boss" : "kpi-tech"}`}
              data-testid="kpi-my-share"
            >
              <div className="label">{primaryShareLabel}</div>
              <div className="value">{formatINR(primaryShareValue)}</div>
            </div>
          </div>

          <div style={{ position: "relative" }}>
            <Search
              size={16}
              style={{
                position: "absolute", left: 14, top: "50%",
                transform: "translateY(-50%)", color: "var(--muted)",
              }}
            />
            <input
              data-testid="search-input"
              className="search"
              style={{ paddingLeft: 40 }}
              placeholder="Search by name, phone or model"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="scope-row" data-testid="scope-row">
            <button
              data-testid="scope-all"
              className={`chip ${scope === "all" ? "active" : ""}`}
              onClick={() => setScope("all")}
            >All jobs</button>
            <button
              data-testid="scope-mine"
              className={`chip ${scope === "mine" ? "active" : ""}`}
              onClick={() => setScope("mine")}
            >Added by me</button>
          </div>

          <div className="tabs" role="tablist" data-testid="tabs">
            {TABS.map((t) => (
              <button
                key={t}
                data-testid={`tab-${t.toLowerCase()}`}
                className={`tab ${tab === t ? "active" : ""}`}
                onClick={() => setTab(t)}
              >{t}</button>
            ))}
          </div>

          {loading ? (
            <div className="empty" data-testid="loading">
              <Loader2 className="spin" style={{ display: "inline" }} /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty" data-testid="empty-state">
              {scope === "mine"
                ? "No jobs added by you in this filter yet."
                : "No jobs here yet. Tap the + button to add one."}
            </div>
          ) : (
            <div className="list" data-testid="job-list">
              {filtered.map((j) => (
                <JobCard
                  key={j.ID}
                  job={j}
                  onComplete={handleComplete}
                  onEdit={openEdit}
                  onOpenCustomer={openCustomer}
                  busy={busyId === j.ID}
                  formatINR={formatINR}
                  display={display}
                />
              ))}
            </div>
          )}

          <button
            className="fab"
            data-testid="fab-add-job"
            onClick={openAdd}
            aria-label="Add job"
          >
            <Plus size={26} strokeWidth={2.5} />
          </button>
        </>
      ) : (
        <Reports jobs={jobs} />
      )}

      <JobDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditingJob(null);
        }}
        onSaved={handleSaved}
        job={editingJob}
      />

      <CustomerHistory
        open={!!historyPhone}
        onOpenChange={(o) => { if (!o) setHistoryPhone(null); }}
        phone={historyPhone}
        jobs={jobs}
      />
    </div>
  );
}
