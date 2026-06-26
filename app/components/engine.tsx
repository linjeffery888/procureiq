"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

// The platform-wide Engine preference, surfaced as the top-bar Live/Offline
// toggle. "live" lets the model-backed surfaces (ContractIQ, BudgetIQ Invoices)
// call Claude when a key is present; "offline" forces the deterministic path so
// a presenter can demo the heuristic engine on demand. The pages pass
// forceOffline to /api/extract and /api/triage, and render the actual engine the
// API reports in its _meta block, so the badge never claims work the model did
// not do.
//
// demoMode is the one-click presentation switch. startDemo() selects the live
// engine (so the audience sees the real model reading the contracts and
// invoices, not the heuristic fallback) and flips demoMode on; each module
// watches demoMode and auto-runs its batch on entry, so a single click lights up
// every pass / flag / review state across ContractIQ and BudgetIQ. It is
// session-scoped so a hard reload mid-presentation does not drop the walkthrough.
// If no key is present the API transparently falls back to the offline engine and
// reports that in its _meta, so the demo still completes without a live key.

export type EngineMode = "live" | "offline";

interface EngineCtx {
  engine: EngineMode;
  setEngine: (e: EngineMode) => void;
  forceOffline: boolean;
  demoMode: boolean;
  startDemo: () => void;
  exitDemo: () => void;
}

const Ctx = createContext<EngineCtx | null>(null);

export function EngineProvider({ children }: { children: ReactNode }) {
  const [engine, setEngine] = useState<EngineMode>("live");
  const [demoMode, setDemoMode] = useState(false);

  // Restore an in-progress demo across a hard reload. Session-scoped, so it
  // never leaks past the browser session.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("pq-demo") === "1") {
      setDemoMode(true);
      setEngine("live");
    }
  }, []);

  function startDemo() {
    setEngine("live");
    setDemoMode(true);
    if (typeof window !== "undefined") sessionStorage.setItem("pq-demo", "1");
  }

  function exitDemo() {
    setDemoMode(false);
    if (typeof window !== "undefined") sessionStorage.removeItem("pq-demo");
  }

  return (
    <Ctx.Provider value={{ engine, setEngine, forceOffline: engine === "offline", demoMode, startDemo, exitDemo }}>
      {children}
    </Ctx.Provider>
  );
}

export function useEngine(): EngineCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useEngine must be used inside EngineProvider");
  return ctx;
}
