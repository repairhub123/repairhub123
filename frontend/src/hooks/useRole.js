import { useEffect, useState, useCallback } from "react";

const KEY = "repair-desk-role";

export function getStoredRole() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function useRole() {
  const [role, setRole] = useState(getStoredRole());

  const save = useCallback((r) => {
    try {
      localStorage.setItem(KEY, r);
    } catch {}
    setRole(r);
  }, []);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    setRole("");
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === KEY) setRole(e.newValue || "");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { role, setRole: save, clearRole: clear };
}
