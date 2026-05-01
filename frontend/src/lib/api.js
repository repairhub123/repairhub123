import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
});

export async function fetchJobs() {
  const res = await api.get("/jobs");
  return Array.isArray(res.data) ? res.data : [];
}

export async function addJob(payload) {
  // Always POST with JSON.stringify body (axios already does JSON)
  const res = await api.post("/jobs", payload);
  return res.data;
}

export async function markCompleted(id) {
  const res = await api.post("/jobs/update", {
    id,
    status: "Completed",
  });
  return res.data;
}

export async function fetchConfig() {
  const res = await api.get("/config");
  return res.data;
}

export function formatINR(v) {
  const n = Number(v || 0);
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function display(v) {
  if (v === null || v === undefined) return "N/A";
  const s = String(v).trim();
  return s ? s : "N/A";
}

export async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
