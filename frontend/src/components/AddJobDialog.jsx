import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { addJob, formatINR } from "@/lib/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const REPAIR_TYPES = [
  "Screen",
  "Battery",
  "Charging",
  "Software",
  "Water Damage",
  "Speaker/Mic",
  "Camera",
  "Other",
];

const PERCENT_OPTIONS = [30, 40];

const EMPTY = {
  name: "",
  phone: "",
  model: "",
  types: [],
  description: "",
  cost: "",
  amount: "",
  percentage: 30,
};

export default function AddJobDialog({ open, onOpenChange, onAdded }) {
  const [f, setF] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  const profit = useMemo(() => {
    const a = Number(f.amount || 0);
    const c = Number(f.cost || 0);
    return a - c;
  }, [f.amount, f.cost]);

  const share = useMemo(() => {
    return Math.round(profit * (Number(f.percentage) / 100) * 100) / 100;
  }, [profit, f.percentage]);

  const toggleType = (t) =>
    setF((p) => ({
      ...p,
      types: p.types.includes(t)
        ? p.types.filter((x) => x !== t)
        : [...p.types, t],
    }));

  const reset = () => setF(EMPTY);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return toast.error("Name is required");
    if (!f.phone.trim()) return toast.error("Phone is required");
    if (!f.model.trim()) return toast.error("Model is required");
    if (f.types.length === 0) return toast.error("Select at least one repair type");

    const work =
      f.types.join(", ") + (f.description.trim() ? ` — ${f.description.trim()}` : "");

    setSubmitting(true);
    try {
      await addJob({
        name: f.name.trim(),
        phone: f.phone.trim(),
        model: f.model.trim(),
        work,
        cost: Number(f.cost || 0),
        amount: Number(f.amount || 0),
        percentage: Number(f.percentage),
      });
      reset();
      onOpenChange(false);
      onAdded && onAdded();
    } catch (err) {
      console.error(err);
      toast.error("Failed to add job");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="dialog-content max-w-lg"
        data-testid="add-job-dialog"
      >
        <DialogHeader>
          <DialogTitle style={{ color: "var(--text)" }}>New Repair Job</DialogTitle>
          <DialogDescription style={{ color: "var(--muted)" }}>
            Fill in the customer and repair details. Profit and share are calculated automatically.
          </DialogDescription>
        </DialogHeader>

        <form className="form" onSubmit={onSubmit}>
          <div className="field">
            <label>Customer name</label>
            <input
              data-testid="input-name"
              className="input"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              placeholder="Ravi Kumar"
              autoFocus
            />
          </div>

          <div className="row2">
            <div className="field">
              <label>Phone</label>
              <input
                data-testid="input-phone"
                className="input"
                inputMode="tel"
                value={f.phone}
                onChange={(e) => setF({ ...f, phone: e.target.value })}
                placeholder="98xxxxxxxx"
              />
            </div>
            <div className="field">
              <label>Model</label>
              <input
                data-testid="input-model"
                className="input"
                value={f.model}
                onChange={(e) => setF({ ...f, model: e.target.value })}
                placeholder="iPhone 12"
              />
            </div>
          </div>

          <div className="field">
            <label>Repair type (multi-select)</label>
            <div className="chips" data-testid="repair-types">
              {REPAIR_TYPES.map((t) => (
                <button
                  type="button"
                  key={t}
                  data-testid={`chip-${t.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
                  className={`chip ${f.types.includes(t) ? "active" : ""}`}
                  onClick={() => toggleType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Description (optional)</label>
            <textarea
              data-testid="input-description"
              className="textarea"
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
              placeholder="Cracked display, touch works"
            />
          </div>

          <div className="row2">
            <div className="field">
              <label>Cost (₹)</label>
              <input
                data-testid="input-cost"
                className="input mono"
                inputMode="numeric"
                value={f.cost}
                onChange={(e) => setF({ ...f, cost: e.target.value.replace(/[^0-9.]/g, "") })}
                placeholder="0"
              />
            </div>
            <div className="field">
              <label>Amount (₹)</label>
              <input
                data-testid="input-amount"
                className="input mono"
                inputMode="numeric"
                value={f.amount}
                onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^0-9.]/g, "") })}
                placeholder="0"
              />
            </div>
          </div>

          <div className="field">
            <label>Share percentage</label>
            <div className="chips">
              {PERCENT_OPTIONS.map((p) => (
                <button
                  type="button"
                  key={p}
                  data-testid={`chip-percent-${p}`}
                  className={`chip ${f.percentage === p ? "active" : ""}`}
                  onClick={() => setF({ ...f, percentage: p })}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>

          <div className="calc" data-testid="calc-preview">
            <div className="cell">
              <div className="k">Profit</div>
              <div className="v">{formatINR(profit)}</div>
            </div>
            <div className="cell">
              <div className="k">Share ({f.percentage}%)</div>
              <div className="v accent">{formatINR(share)}</div>
            </div>
          </div>

          <DialogFooter style={{ marginTop: 6 }}>
            <button
              type="button"
              data-testid="btn-cancel"
              className="btn"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="btn-save-job"
              className="btn primary"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="spin" /> Saving…
                </>
              ) : (
                "Save Job"
              )}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
