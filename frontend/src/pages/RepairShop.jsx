import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Plus, Search, Wrench, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchJobs,
  markCompleted,
  fetchConfig,
  formatINR,
  display,
  delay,
} from "@/lib/api";
import AddJobDialog from "@/components/AddJobDialog";
import JobCard from "@/components/JobCard";

const TABS = ["All", "Pending", "Completed"];

export default function RepairShop() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("All");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [sheetConnected, setSheetConnected] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJobs();
      setJobs(data);
    } catch (e) {
      console.error(e);
      toast.error("Failed to fetch jobs");
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const cfg = await fetchConfig();
        setSheetConnected(cfg.sheet_connected);
      } catch (e) {
        setSheetConnected(false);
      }
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const syncAfterWrite = async () => {
    await delay(1000); // wait 1 second per spec
    await refresh();
  };

  const handleAdded = async () => {
    toast.success("Job added");
    await syncAfterWrite();
  };

  const handleComplete = async (id) => {
    setBusyId(id);
    try {
      await markCompleted(id);
      toast.success("Marked completed");
      await syncAfterWrite();
    } catch (e) {
      toast.error("Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    let list = jobs;
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
    // Sort: Pending first, newest received first
    return [...list].sort((a, b) => {
      if (a.Status !== b.Status) return a.Status === "Completed" ? 1 : -1;
      return (
        (b.received_date + " " + b.received_time).localeCompare(
          a.received_date + " " + a.received_time
        )
      );
    });
  }, [jobs, tab, query]);

  const totals = useMemo(() => {
    const pending = jobs.filter((j) => j.Status !== "Completed").length;
    const completed = jobs.filter((j) => j.Status === "Completed").length;
    const totalShare = jobs.reduce((s, j) => s + Number(j.Share || 0), 0);
    return { pending, completed, totalShare };
  }, [jobs]);

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
        <div
          className="mono"
          style={{ fontSize: 11, color: "var(--muted)" }}
          data-testid="sheet-status"
        >
          {sheetConnected === null
            ? "…"
            : sheetConnected
            ? "● SHEET LIVE"
            : "● LOCAL MODE"}
        </div>
      </header>

      {sheetConnected === false && (
        <div className="toast-banner warn" data-testid="local-mode-banner">
          Running in local mode. Deploy the Apps Script and set
          GOOGLE_SHEET_WEBAPP_URL in backend/.env to sync with Google Sheets.
        </div>
      )}

      <div className="kpis" data-testid="kpis">
        <div className="kpi warn" data-testid="kpi-pending">
          <div className="label">Pending</div>
          <div className="value">{totals.pending}</div>
        </div>
        <div className="kpi" data-testid="kpi-completed">
          <div className="label">Completed</div>
          <div className="value">{totals.completed}</div>
        </div>
        <div className="kpi accent" data-testid="kpi-share">
          <div className="label">Total Share</div>
          <div className="value">{formatINR(totals.totalShare)}</div>
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <Search
          size={16}
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--muted)",
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

      <div className="tabs" role="tablist" data-testid="tabs">
        {TABS.map((t) => (
          <button
            key={t}
            data-testid={`tab-${t.toLowerCase()}`}
            className={`tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty" data-testid="loading">
          <Loader2 className="spin" style={{ display: "inline" }} /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty" data-testid="empty-state">
          No jobs here yet. Tap the + button to add one.
        </div>
      ) : (
        <div className="list" data-testid="job-list">
          {filtered.map((j) => (
            <JobCard
              key={j.ID}
              job={j}
              onComplete={handleComplete}
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
        onClick={() => setOpen(true)}
        aria-label="Add job"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      <AddJobDialog open={open} onOpenChange={setOpen} onAdded={handleAdded} />
    </div>
  );
}
