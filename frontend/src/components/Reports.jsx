import React, { useMemo, useState } from "react";
import { formatINR } from "@/lib/api";
import { TrendingUp, Wallet, Coins, Receipt, Briefcase } from "lucide-react";

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
];

function pad(n) { return String(n).padStart(2, "0"); }
function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function startOfWeek() {
  const d = startOfToday();
  const day = d.getDay(); // 0 = Sun
  const diff = (day + 6) % 7; // Monday as first day
  d.setDate(d.getDate() - diff);
  return d;
}
function startOfMonth() { const d = startOfToday(); d.setDate(1); return d; }

function inRange(dateStr, fromISO) {
  if (!fromISO) return true;
  const d = (dateStr || "").trim();
  return d && d >= fromISO;
}

export default function Reports({ jobs }) {
  const [period, setPeriod] = useState("today");

  const fromISO = useMemo(() => {
    if (period === "today") return toISO(startOfToday());
    if (period === "week") return toISO(startOfWeek());
    if (period === "month") return toISO(startOfMonth());
    return "";
  }, [period]);

  const stats = useMemo(() => {
    // Job counts are filtered by received_date (how many new jobs came in)
    const received = jobs.filter((j) => inRange(j.received_date, fromISO));
    // Financial KPIs only count Completed jobs, filtered by completed_date (when money realized)
    const earned = jobs.filter(
      (j) => j.Status === "Completed" && inRange(j.completed_date, fromISO)
    );
    const sum = (list, k) => list.reduce((s, j) => s + Number(j[k] || 0), 0);
    const pending = received.filter((j) => j.Status !== "Completed").length;
    const completed = earned.length;
    return {
      received, earned,
      count: received.length,
      pending, completed,
      revenue: sum(earned, "Amount"),
      cost: sum(earned, "Cost"),
      profit: sum(earned, "Profit"),
      share: sum(earned, "Share"),
    };
  }, [jobs, fromISO]);

  const recent = useMemo(
    () =>
      [...stats.earned]
        .sort((a, b) =>
          (b.completed_date + " " + b.completed_time).localeCompare(
            a.completed_date + " " + a.completed_time
          )
        )
        .slice(0, 5),
    [stats.earned]
  );

  const periodLabel = PERIODS.find((p) => p.key === period)?.label || "";

  return (
    <div data-testid="reports-screen">
      <div className="period-chips" data-testid="period-chips">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            data-testid={`period-${p.key}`}
            className={`chip ${period === p.key ? "active" : ""}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="report-header mono" data-testid="report-range">
        {fromISO ? `Financials from completed jobs since ${fromISO}` : "All time · completed jobs only"}
      </div>

      <div className="report-grid" data-testid="report-kpis">
        <ReportCard
          icon={<TrendingUp size={16} />}
          label="Revenue"
          value={formatINR(stats.revenue)}
          accent
          testid="report-revenue"
        />
        <ReportCard
          icon={<Receipt size={16} />}
          label="Cost"
          value={formatINR(stats.cost)}
          testid="report-cost"
        />
        <ReportCard
          icon={<Wallet size={16} />}
          label="Profit"
          value={formatINR(stats.profit)}
          accent
          testid="report-profit"
        />
        <ReportCard
          icon={<Coins size={16} />}
          label="My Share"
          value={formatINR(stats.share)}
          accent
          testid="report-share"
        />
        <ReportCard
          icon={<Briefcase size={16} />}
          label="Jobs"
          value={stats.count}
          testid="report-jobs"
        />
        <div className="report-card status-split" data-testid="report-status">
          <div>
            <div className="k">Pending</div>
            <div className="v" style={{ color: "var(--warn)" }}>{stats.pending}</div>
          </div>
          <div>
            <div className="k">Completed</div>
            <div className="v" style={{ color: "var(--ok)" }}>{stats.completed}</div>
          </div>
        </div>
      </div>

      <div className="recent-head">
        <h3>Recent completions — {periodLabel}</h3>
        <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>
          top 5
        </span>
      </div>

      {recent.length === 0 ? (
        <div className="empty" data-testid="report-empty">
          No completed jobs in this period yet.
        </div>
      ) : (
        <div className="recent-list" data-testid="recent-list">
          {recent.map((j) => (
            <div className="recent-row" key={j.ID} data-testid={`recent-${j.ID}`}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="recent-name">{j.Name || "N/A"}</div>
                <div className="recent-sub mono">
                  {j.Model || "—"} · done {j.completed_date} {j.completed_time}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="recent-amount">{formatINR(j.Amount)}</div>
                <div className="recent-share accent">{formatINR(j.Share)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ icon, label, value, accent, testid }) {
  return (
    <div className={`report-card ${accent ? "accent" : ""}`} data-testid={testid}>
      <div className="report-top">
        <span className="report-icon">{icon}</span>
        <span className="k">{label}</span>
      </div>
      <div className="v">{value}</div>
    </div>
  );
}
