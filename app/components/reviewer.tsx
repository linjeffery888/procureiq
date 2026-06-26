"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

// The reviewer identity: the name of the person operating the platform this
// session. The audit trail signs every human decision (a committed contract, an
// approved or overridden invoice, a budget actuals apply, a threshold edit) with
// this name, so it is captured ONCE at the start of the workflow and reused on
// every touchpoint instead of the old hardcoded role string.
//
// Session-scoped (sessionStorage, key pq-reviewer), mirroring the demo-mode
// pattern in EngineProvider: the name survives a hard reload mid-session but is
// re-prompted in a fresh browser session, so a shared machine never silently
// signs the next person's decisions with the previous person's name.

const KEY = "pq-reviewer";

interface ReviewerCtx {
  name: string;            // "" until set this session
  ready: boolean;          // true once sessionStorage has been read (post-hydration)
  setName: (name: string) => void;
  clear: () => void;
}

const Ctx = createContext<ReviewerCtx | null>(null);

export function ReviewerProvider({ children }: { children: ReactNode }) {
  const [name, setNameState] = useState("");
  // ready gates the first-load identity prompt: we cannot know whether a name is
  // already set until sessionStorage is read on the client, and rendering the
  // blocking gate before that would flash it on every reload even when a name
  // exists. So the gate waits for ready.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem(KEY) || "";
    if (stored) setNameState(stored);
    setReady(true);
  }, []);

  function setName(next: string) {
    const clean = next.trim();
    setNameState(clean);
    if (typeof window === "undefined") return;
    if (clean) sessionStorage.setItem(KEY, clean);
    else sessionStorage.removeItem(KEY);
  }

  function clear() {
    setName("");
  }

  return <Ctx.Provider value={{ name, ready, setName, clear }}>{children}</Ctx.Provider>;
}

export function useReviewer(): ReviewerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useReviewer must be used inside ReviewerProvider");
  return ctx;
}
