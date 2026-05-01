import React from "react";
import { CheckCircle2, Loader2, Phone, Smartphone } from "lucide-react";

export default function JobCard({ job, onComplete, busy, formatINR, display }) {
  const isCompleted = job.Status === "Completed";
  return (
    <div className="job" data-testid={`job-card-${job.ID}`}>
      <div className="job-top">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="job-name" data-testid={`job-name-${job.ID}`}>
            {display(job.Name)}
          </div>
          <div className="job-phone">
            <Phone size={11} style={{ display: "inline", marginRight: 4 }} />
            {display(job.Phone)}
          </div>
          <div className="job-model">
            <Smartphone size={12} style={{ display: "inline", marginRight: 6 }} />
            {display(job.Model)}
          </div>
          <div className="job-work">{display(job.Work)}</div>
        </div>
        <span
          className={`badge ${isCompleted ? "completed" : "pending"}`}
          data-testid={`job-status-${job.ID}`}
        >
          {isCompleted ? "Completed" : "Pending"}
        </span>
      </div>

      <div className="grid-3">
        <div className="cell">
          <div className="k">Amount</div>
          <div className="v">{formatINR(job.Amount)}</div>
        </div>
        <div className="cell">
          <div className="k">Profit</div>
          <div className="v">{formatINR(job.Profit)}</div>
        </div>
        <div className="cell">
          <div className="k">Share</div>
          <div className="v accent">{formatINR(job.Share)}</div>
        </div>
      </div>

      <div className="meta">
        <span className="mono">
          Recv: {display(job.received_date)} {display(job.received_time)}
        </span>
        <span className="mono">
          Done: {display(job.completed_date)} {display(job.completed_time)}
        </span>
      </div>

      {!isCompleted && (
        <div className="actions">
          <button
            className="btn primary full"
            data-testid={`btn-complete-${job.ID}`}
            onClick={() => onComplete(job.ID)}
            disabled={busy}
          >
            {busy ? (
              <>
                <Loader2 size={14} className="spin" /> Updating…
              </>
            ) : (
              <>
                <CheckCircle2 size={15} /> Mark as Completed
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
