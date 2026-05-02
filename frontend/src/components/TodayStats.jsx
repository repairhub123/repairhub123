import React, { useMemo } from "react";
import { formatINR } from "@/lib/api";

function toISO(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function TodayStats({ jobs, role }) {
  const stats = useMemo(() => {
    const today = toISO(new Date());
    const todays = jobs.filter((j) => j.received_date === today);
    const completedToday = jobs.filter(
      (j) => j.Status === "Completed" && j.completed_date === today
    );
    const sum = (list, k) => list.reduce((s, j) => s + Number(j[k] || 0), 0);
    const myKey = role === "Boss" ? "boss_share" : "technician_share";
    const otherKey = role === "Boss" ? "technician_share" : "boss_share";
    return {
      count: todays.length,
      completed: completedToday.length,
      myShare: sum(completedToday, myKey),
      otherShare: sum(completedToday, otherKey),
    };
  }, [jobs, role]);

  const otherName = role === "Boss" ? "Tech" : "Boss";

  return (
    <div className="today-strip" data-testid="today-strip">
      <div className="today-tile">
        <div className="k">Today</div>
        <div className="v" data-testid="today-count">{stats.count}</div>
        <div className="sub">{stats.completed} done</div>
      </div>
      <div className={`today-tile my ${role === "Boss" ? "boss" : "tech"}`}>
        <div className="k">My share (today)</div>
        <div className="v" data-testid="today-my-share">{formatINR(stats.myShare)}</div>
        <div className="sub">completed only</div>
      </div>
      <div className={`today-tile other ${role === "Boss" ? "tech" : "boss"}`}>
        <div className="k">{otherName}'s share</div>
        <div className="v" data-testid="today-other-share">{formatINR(stats.otherShare)}</div>
        <div className="sub">today's done</div>
      </div>
    </div>
  );
}
