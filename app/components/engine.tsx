"use client";

import { createContext, useContext, useState, ReactNode } from "react";

// The platform-wide Engine preference, surfaced as the top-bar Live/Offline
// toggle. "live" lets the model-backed surfaces (ContractIQ, BudgetIQ Invoices)
// call Claude when a key is present; "offline" forces the deterministic path so
// a presenter can demo the heuristic engine on demand. The pages pass
// forceOffline to /api/extract and /api/triage, and render the actual engine the
// API reports in its _meta block, so the badge never claims work the model did
// not do.

export type EngineMode = "live" | "offline";

interface EngineCtx {
  engine: EngineMode;
  setEngine: (e: EngineMode) => void;
  forceOffline: boolean;
}

const Ctx = createContext<EngineCtx | null>(null);

export function EngineProvider({ children }: { children: ReactNode }) {
  const [engine, setEngine] = useState<EngineMode>("live");
  return (
    <Ctx.Provider value={{ engine, setEngine, forceOffline: engine === "offline" }}>
      {children}
    </Ctx.Provider>
  );
}

export function useEngine(): EngineCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useEngine must be used inside EngineProvider");
  return ctx;
}
