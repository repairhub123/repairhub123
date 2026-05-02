import React, { useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { formatINR } from "@/lib/api";
import { Phone } from "lucide-react";

export default function CustomerHistory({ open, onOpenChange, phone, jobs }) {
  const list = useMemo(() => {
    if (!phone) return [];
    return jobs
      .filter((j) => j.Phone === phone)
      .sort((a, b) =>
        (b.received_date + " " + b.received_time).localeCompare(
          a.received_date + " " + a.received_time
        )
      );
  }, [jobs, phone]);

  const totals = useMemo(() => {
    const completed = list.filter((j) => j.Status === "Completed");
    return {
      visits: list.length,
      paid: completed.reduce((s, j) => s + Number(j.Amount || 0), 0),
    };
  }, [list]);

  const customerName = list[0]?.Name || "Customer";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="dialog-content max-w-lg max-h-[85vh] overflow-y-auto"
        data-testid="customer-history-dialog"
      >
        <DialogHeader>
          <DialogTitle style={{ color: "var(--text)" }}>
            {customerName}
          </DialogTitle>
          <DialogDescription style={{ color: "var(--muted)" }}>
            <Phone size={11} style={{ display: "inline", marginRight: 4 }} />
            {phone} · {totals.visits} visit{totals.visits === 1 ? "" : "s"} · paid {formatINR(totals.paid)}
          </DialogDescription>
        </DialogHeader>

        {list.length === 0 ? (
          <div className="empty">No previous visits.</div>
        ) : (
          <div className="history-list" data-testid="history-list">
            {list.map((j) => (
              <div className="history-row" key={j.ID} data-testid={`history-${j.ID}`}>
                <div className="history-top">
                  <div className="history-model">{j.Model || "—"}</div>
                  <span
                    className={`badge ${j.Status === "Completed" ? "completed" : "pending"}`}
                  >
                    {j.Status}
                  </span>
                </div>
                <div className="history-work">{j.Work || "—"}</div>
                <div className="history-meta mono">
                  <span>{j.received_date} {j.received_time}</span>
                  <span className="history-amount">{formatINR(j.Amount)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
