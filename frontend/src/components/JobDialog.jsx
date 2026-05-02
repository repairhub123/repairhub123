import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { addJob, editJob, uploadPhoto, photoUrl, formatINR } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Camera, ImagePlus, X } from "lucide-react";

const REPAIR_TYPES = [
  "Screen", "Battery", "Charging", "Software",
  "Water Damage", "Speaker/Mic", "Camera", "Other",
];

const PERCENT_OPTIONS = [30, 40];

const EMPTY = {
  name: "", phone: "", model: "",
  types: [], description: "",
  cost: "", amount: "", percentage: 30,
  photoPath: "", photoPreview: "",
};

/**
 * Parse the stored "Work" string back into selected types + description.
 * Format when saved: "Screen, Battery — cracked display"
 */
function parseWork(work) {
  const w = (work || "").trim();
  if (!w) return { types: [], description: "" };
  const splitIdx = w.indexOf(" — ");
  const head = splitIdx >= 0 ? w.slice(0, splitIdx) : w;
  const tail = splitIdx >= 0 ? w.slice(splitIdx + 3).trim() : "";
  const candidates = head.split(",").map((s) => s.trim()).filter(Boolean);
  const matched = candidates.filter((c) => REPAIR_TYPES.includes(c));
  // If head didn't match any known type, treat entire thing as description
  if (matched.length === 0) return { types: [], description: w };
  // Any unknown tokens in head become part of description
  const extras = candidates.filter((c) => !REPAIR_TYPES.includes(c));
  const description = [extras.join(", "), tail].filter(Boolean).join(" — ");
  return { types: matched, description };
}

export default function JobDialog({ open, onOpenChange, onSaved, job }) {
  const isEdit = !!job;
  const [f, setF] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  // Seed form from job on open (edit mode) or reset (add mode)
  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      const { types, description } = parseWork(job.Work);
      setF({
        name: job.Name || "",
        phone: job.Phone || "",
        model: job.Model || "",
        types,
        description,
        cost: String(job.Cost ?? ""),
        amount: String(job.Amount ?? ""),
        percentage: Number(job.Percentage) || 30,
        photoPath: job.Photo || "",
        photoPreview: "",
      });
    } else {
      setF(EMPTY);
    }
  }, [open, isEdit, job]);

  const profit = useMemo(() => Number(f.amount || 0) - Number(f.cost || 0), [f.amount, f.cost]);
  const share = useMemo(
    () => Math.round(profit * (Number(f.percentage) / 100) * 100) / 100,
    [profit, f.percentage]
  );

  const toggleType = (t) =>
    setF((p) => ({
      ...p,
      types: p.types.includes(t) ? p.types.filter((x) => x !== t) : [...p.types, t],
    }));

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image too large (max 8MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setF((p) => ({ ...p, photoPreview: e.target.result }));
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const { path } = await uploadPhoto(file);
      setF((p) => ({ ...p, photoPath: path }));
      toast.success("Photo uploaded");
    } catch (err) {
      console.error(err);
      toast.error("Photo upload failed");
      setF((p) => ({ ...p, photoPreview: "" }));
    } finally {
      setUploading(false);
    }
  };

  const clearPhoto = () => setF((p) => ({ ...p, photoPath: "", photoPreview: "" }));

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
      const payload = {
        name: f.name.trim(),
        phone: f.phone.trim(),
        model: f.model.trim(),
        work,
        cost: Number(f.cost || 0),
        amount: Number(f.amount || 0),
        percentage: Number(f.percentage),
        photo: f.photoPath || "",
      };
      if (isEdit) {
        await editJob(job.ID, payload);
      } else {
        await addJob(payload);
      }
      onOpenChange(false);
      onSaved && onSaved();
    } catch (err) {
      console.error(err);
      toast.error(isEdit ? "Failed to update job" : "Failed to add job");
    } finally {
      setSubmitting(false);
    }
  };

  const previewSrc = f.photoPreview || (f.photoPath ? photoUrl(f.photoPath) : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="dialog-content max-w-lg max-h-[92vh] overflow-y-auto"
        data-testid="job-dialog"
      >
        <DialogHeader>
          <DialogTitle style={{ color: "var(--text)" }}>
            {isEdit ? "Edit Job" : "New Repair Job"}
          </DialogTitle>
          <DialogDescription style={{ color: "var(--muted)" }}>
            {isEdit
              ? "Update any field. Profit and share recalculate automatically."
              : "Fill in details. Profit and share are calculated automatically."}
          </DialogDescription>
        </DialogHeader>

        <form className="form" onSubmit={onSubmit}>
          {/* Photo */}
          <div className="field">
            <label>Phone photo</label>
            {previewSrc ? (
              <div className="photo-preview" data-testid="photo-preview">
                <img src={previewSrc} alt="Phone" />
                <button
                  type="button"
                  className="photo-remove"
                  data-testid="btn-remove-photo"
                  onClick={clearPhoto}
                  aria-label="Remove photo"
                >
                  <X size={14} />
                </button>
                {uploading && (
                  <div className="photo-overlay">
                    <Loader2 size={18} className="spin" />
                  </div>
                )}
              </div>
            ) : (
              <div className="photo-picker">
                <button
                  type="button"
                  className="btn photo-btn"
                  data-testid="btn-capture-camera"
                  onClick={() => cameraRef.current?.click()}
                  disabled={uploading}
                >
                  <Camera size={16} /> Camera
                </button>
                <button
                  type="button"
                  className="btn photo-btn"
                  data-testid="btn-pick-gallery"
                  onClick={() => galleryRef.current?.click()}
                  disabled={uploading}
                >
                  <ImagePlus size={16} /> Gallery
                </button>
              </div>
            )}
            <input
              ref={cameraRef} type="file" accept="image/*" capture="environment"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files?.[0])}
              data-testid="input-camera"
            />
            <input
              ref={galleryRef} type="file" accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files?.[0])}
              data-testid="input-gallery"
            />
          </div>

          <div className="field">
            <label>Customer name</label>
            <input
              data-testid="input-name"
              className="input"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              placeholder="Ravi Kumar"
            />
          </div>

          <div className="row2">
            <div className="field">
              <label>Phone</label>
              <input
                data-testid="input-phone"
                className="input" inputMode="tel"
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
                className="input mono" inputMode="numeric"
                value={f.cost}
                onChange={(e) => setF({ ...f, cost: e.target.value.replace(/[^0-9.]/g, "") })}
                placeholder="0"
              />
            </div>
            <div className="field">
              <label>Amount (₹)</label>
              <input
                data-testid="input-amount"
                className="input mono" inputMode="numeric"
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
                  className={`chip ${Number(f.percentage) === p ? "active" : ""}`}
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
              <div className="v profit">{formatINR(profit)}</div>
            </div>
            <div className="cell">
              <div className="k">Technician ({f.percentage}%)</div>
              <div className="v tech">{formatINR(share)}</div>
            </div>
            <div className="cell">
              <div className="k">Boss</div>
              <div className="v boss">{formatINR(profit - share)}</div>
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
              disabled={submitting || uploading}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="spin" /> Saving…
                </>
              ) : isEdit ? "Save Changes" : "Save Job"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
