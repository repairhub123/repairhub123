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

function inRange(job, fromISO) {
  if (!fromISO) return true;
  const rd = (job.received_date || "").trim();
  return rd && rd >= fromISO;
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
    const filtered = jobs.filter((j) => inRange(j, fromISO));
    const sum = (k) => filtered.reduce((s, j) => s + Number(j[k] || 0), 0);
    const pending = filtered.filter((j) => j.Status !== "Completed").length;
    const completed = filtered.filter((j) => j.Status === "Completed").length;
    return {
      list: filtered,
      count: filtered.length,
      pending,
      completed,
      revenue: sum("Amount"),
      cost: sum("Cost"),
      profit: sum("Profit"),
      share: sum("Share"),
    };
  }, [jobs, fromISO]);

  const recent = useMemo(
    () =>
      [...stats.list]
        .sort((a, b) =>
          (b.received_date + " " + b.received_time).localeCompare(
            a.received_date + " " + a.received_time
          )
        )
        .slice(0, 5),
    [stats.list]
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
        {fromISO ? `From ${fromISO} → today` : "All time"}
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
        <h3>Recent — {periodLabel}</h3>
        <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>
          top 5
        </span>
      </div>

      {recent.length === 0 ? (
        <div className="empty" data-testid="report-empty">
          No jobs in this period yet.
        </div>
      ) : (
        <div className="recent-list" data-testid="recent-list">
          {recent.map((j) => (
            <div className="recent-row" key={j.ID} data-testid={`recent-${j.ID}`}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="recent-name">{j.Name || "N/A"}</div>
                <div className="recent-sub mono">
                  {j.Model || "—"} · {j.received_date} {j.received_time}
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
