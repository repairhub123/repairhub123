import React from "react";
import { Crown, User, Wrench } from "lucide-react";

export default function RoleGate({ onPick }) {
  return (
    <div className="role-gate" data-testid="role-gate">
      <div className="role-card">
        <div className="role-brand">
          <div className="brand-mark">
            <Wrench size={20} />
          </div>
          <div>
            <h1>Repair Desk</h1>
            <small>who's using this device?</small>
          </div>
        </div>
        <p className="role-lead">
          Pick your role so jobs you add are tagged correctly. You can change this anytime from the top menu.
        </p>
        <div className="role-grid">
          <button
            type="button"
            className="role-pick boss"
            onClick={() => onPick("Boss")}
            data-testid="role-boss"
          >
            <Crown size={26} />
            <span className="role-title">Boss</span>
            <span className="role-sub">See overall earnings &amp; business summary</span>
          </button>
          <button
            type="button"
            className="role-pick tech"
            onClick={() => onPick("Technician")}
            data-testid="role-technician"
          >
            <User size={26} />
            <span className="role-title">Technician</span>
            <span className="role-sub">Focus on your jobs &amp; your share</span>
          </button>
        </div>
      </div>
    </div>
  );
}
