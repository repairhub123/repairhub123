import React, { useMemo, useState } from "react";
import { formatINR } from "@/lib/api";
import {
  TrendingUp, Receipt, Wallet, Briefcase, Coins, User, Crown, CheckCircle2,
} from "lucide-react";

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
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}
function startOfMonth() { const d = startOfToday(); d.setDate(1); return d; }

function inRange(dateStr, fromISO) {
  if (!fromISO) return true;
  const d = (dateStr || "").trim();
  return d && d >= fromISO;
}

const num = (j, k) => Number(j[k] || 0);
const sumBy = (list, k) => list.reduce((s, j) => s + num(j, k), 0);

function totalsOf(list) {
  return {
    count: list.length,
    revenue: sumBy(list, "Amount"),
    cost: sumBy(list, "Cost"),
    profit: sumBy(list, "Profit"),
    technician: sumBy(list, "technician_share"),
    boss: sumBy(list, "boss_share"),
  };
}

export default function Reports({ jobs }) {
  const [period, setPeriod] = useState("today");

  const fromISO = useMemo(() => {
    if (period === "today") return toISO(startOfToday());
    if (period === "week") return toISO(startOfWeek());
    if (period === "month") return toISO(startOfMonth());
    return "";
  }, [period]);

  const { all, completed } = useMemo(() => {
    const inPeriodByReceived = jobs.filter((j) => inRange(j.received_date, fromISO));
    const completedInPeriod = jobs.filter(
      (j) => j.Status === "Completed" && inRange(j.completed_date, fromISO)
    );
    return {
      all: totalsOf(inPeriodByReceived),
      completed: totalsOf(completedInPeriod),
    };
  }, [jobs, fromISO]);

  const pending = all.count - jobs
    .filter((j) => j.Status === "Completed" && inRange(j.received_date, fromISO)).length;

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
        {fromISO ? `Scope: jobs from ${fromISO} onwards` : "Scope: all time"}
      </div>

      {/* A — BUSINESS SUMMARY */}
      <Section title="Business Summary" icon={<Briefcase size={14} />} testid="section-business">
        <div className="report-grid">
          <ReportCard
            icon={<TrendingUp size={16} />} label="Revenue"
            value={formatINR(all.revenue)} testid="report-revenue"
          />
          <ReportCard
            icon={<Receipt size={16} />} label="Cost"
            value={formatINR(all.cost)} testid="report-cost"
          />
          <ReportCard
            icon={<Wallet size={16} />} label="Profit" accent="profit"
            value={formatINR(all.profit)} testid="report-profit"
          />
          <div className="report-card status-split" data-testid="report-status">
            <div>
              <div className="k">Jobs</div>
              <div className="v">{all.count}</div>
            </div>
            <div>
              <div className="k">Pending</div>
              <div className="v" style={{ color: "var(--warn)" }}>{pending}</div>
            </div>
          </div>
        </div>
      </Section>

      {/* B — BOSS */}
      <Section title="Boss Section" icon={<Crown size={14} />} testid="section-boss">
        <BigKPI
          color="boss"
          label="Total Boss Share"
          value={formatINR(all.boss)}
          sub={`from ${all.count} job${all.count === 1 ? "" : "s"} in period`}
          testid="report-boss-share"
        />
      </Section>

      {/* C — TECHNICIAN */}
      <Section title="Technician Section" icon={<User size={14} />} testid="section-technician">
        <BigKPI
          color="tech"
          label="Total Technician Share"
          value={formatINR(all.technician)}
          sub={`from ${all.count} job${all.count === 1 ? "" : "s"} in period`}
          testid="report-tech-share"
        />
      </Section>

      {/* D — COMPLETED ONLY */}
      <Section
        title="Completed Jobs Only"
        icon={<CheckCircle2 size={14} />}
        testid="section-completed"
        subtitle={`${completed.count} completed · based on completion date`}
      >
        <div className="report-grid">
          <ReportCard
            icon={<TrendingUp size={16} />} label="Revenue"
            value={formatINR(completed.revenue)} testid="completed-revenue"
          />
          <ReportCard
            icon={<Wallet size={16} />} label="Profit" accent="profit"
            value={formatINR(completed.profit)} testid="completed-profit"
          />
          <ReportCard
            icon={<Crown size={16} />} label="Boss Share" accent="boss"
            value={formatINR(completed.boss)} testid="completed-boss"
          />
          <ReportCard
            icon={<Coins size={16} />} label="Technician" accent="tech"
            value={formatINR(completed.technician)} testid="completed-tech"
          />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, icon, subtitle, testid, children }) {
  return (
    <div className="report-section" data-testid={testid}>
      <div className="section-head">
        <div className="section-title">
          <span className="section-icon">{icon}</span>
          <h3>{title}</h3>
        </div>
        {subtitle && <span className="section-sub mono">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function ReportCard({ icon, label, value, accent, testid }) {
  return (
    <div className={`report-card ${accent || ""}`} data-testid={testid}>
      <div className="report-top">
        <span className="report-icon">{icon}</span>
        <span className="k">{label}</span>
      </div>
      <div className="v">{value}</div>
    </div>
  );
}

function BigKPI({ color, label, value, sub, testid }) {
  return (
    <div className={`big-kpi ${color}`} data-testid={testid}>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      <div className="sub mono">{sub}</div>
    </div>
  );
}
