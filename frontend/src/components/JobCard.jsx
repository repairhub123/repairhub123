import React, { useState } from "react";
import { CheckCircle2, Loader2, Phone, Smartphone, ImageIcon, Pencil } from "lucide-react";
import { photoUrl } from "@/lib/api";

export default function JobCard({ job, onComplete, onEdit, busy, formatINR, display }) {
  const isCompleted = job.Status === "Completed";
  const [zoom, setZoom] = useState(false);
  const photo = job.Photo ? photoUrl(job.Photo) : "";

  return (
    <div className="job" data-testid={`job-card-${job.ID}`}>
      <div className="job-top">
        {photo ? (
          <button
            type="button"
            className="job-photo"
            onClick={() => setZoom(true)}
            data-testid={`job-photo-${job.ID}`}
            aria-label="View photo"
          >
            <img src={photo} alt="Phone" loading="lazy" />
          </button>
        ) : (
          <div className="job-photo placeholder">
            <ImageIcon size={22} />
          </div>
        )}

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

        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <span
            className={`badge ${isCompleted ? "completed" : "pending"}`}
            data-testid={`job-status-${job.ID}`}
          >
            {isCompleted ? "Completed" : "Pending"}
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onEdit(job)}
            data-testid={`btn-edit-${job.ID}`}
            aria-label="Edit job"
          >
            <Pencil size={13} />
          </button>
        </div>
      </div>

      {/* Finances — Amount / Cost / Profit */}
      <div className="grid-3 fin-row">
        <div className="cell">
          <div className="k">Amount</div>
          <div className="v" data-testid={`job-amount-${job.ID}`}>
            {formatINR(job.Amount)}
          </div>
        </div>
        <div className="cell">
          <div className="k">Cost</div>
          <div className="v" data-testid={`job-cost-${job.ID}`}>
            {formatINR(job.Cost)}
          </div>
        </div>
        <div className="cell">
          <div className="k">Profit</div>
          <div className="v profit" data-testid={`job-profit-${job.ID}`}>
            {formatINR(job.Profit)}
          </div>
        </div>
      </div>

      {/* Earnings split — Technician / Boss */}
      <div className="split-row">
        <div className="split-cell tech" data-testid={`job-tech-${job.ID}`}>
          <div className="k">Technician ({job.Percentage || 30}%)</div>
          <div className="v">{formatINR(job.technician_share)}</div>
        </div>
        <div className="split-cell boss" data-testid={`job-boss-${job.ID}`}>
          <div className="k">Boss</div>
          <div className="v">{formatINR(job.boss_share)}</div>
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

      {zoom && photo && (
        <div
          className="lightbox"
          onClick={() => setZoom(false)}
          data-testid={`job-photo-zoom-${job.ID}`}
        >
          <img src={photo} alt="Phone" />
        </div>
      )}
    </div>
  );
}
