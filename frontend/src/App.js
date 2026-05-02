import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import RepairShop from "@/pages/RepairShop";
import RoleGate from "@/components/RoleGate";
import { useRole } from "@/hooks/useRole";

function Shell() {
  const { role, setRole, clearRole } = useRole();
  if (!role) return <RoleGate onPick={setRole} />;
  return <RepairShop role={role} onSwitchRole={clearRole} />;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Shell />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        position="top-center"
        theme="dark"
        toastOptions={{
          style: {
            background: "#111219",
            border: "1px solid #232634",
            color: "#e7e9f3",
          },
        }}
      />
    </div>
  );
}

export default App;
