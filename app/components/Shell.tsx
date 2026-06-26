"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import { useEngine } from "./engine";

// The single ProcureIQ shell: top bar (logo + nav + Engine toggle), the
// synthetic-data band, and the bounded main column. One shell, two modules
// (ContractIQ, BudgetIQ) plus the shared Knowledge and Impact surfaces. Active
// nav is derived from the path so the user always knows which surface they are
// on. Ported from the approved design comp.

type NavLeaf = { href: string; label: string };
type NavGroup = { label: string; children: NavLeaf[] };
type NavItem = NavLeaf | NavGroup;

// ContractIQ and BudgetIQ are the two modules; each owns two surfaces that appear
// on hover. Dashboard and Impact stay as plain top-level links.
const NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  {
    label: "ContractIQ",
    children: [
      { href: "/contract-review", label: "Contract Review" },
      { href: "/knowledge", label: "Knowledge" },
    ],
  },
  {
    label: "BudgetIQ",
    children: [
      { href: "/invoice-matching", label: "Invoice Check" },
      { href: "/financial-planning", label: "Budget Planning" },
    ],
  },
  { href: "/impact", label: "Impact" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { engine, setEngine } = useEngine();
  const live = engine === "live";
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div
      style={{
        // Theme tokens the comp exposes; defaults baked in here.
        ["--accent" as any]: "#1f7a5a",
        ["--navy" as any]: "#1f3a5f",
        ["--heading-font" as any]: "'Source Serif 4', Georgia, serif",
        ["--row-pad" as any]: "14px 18px",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f5f6f7",
      }}
    >
      {/* Top bar */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e6e8ec", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1260, margin: "0 auto", padding: "0 28px", height: 60, display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <div style={{ width: 25, height: 25, borderRadius: 6, background: "var(--navy)", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", border: "2.5px solid var(--accent)", borderRightColor: "transparent", transform: "rotate(-45deg)" }} />
            </div>
            <span className="serif" style={{ fontWeight: 600, fontSize: 17, letterSpacing: "-.3px", color: "#16202e" }}>ProcureIQ</span>
          </Link>

          <nav style={{ display: "flex", alignItems: "stretch", gap: 0, marginLeft: 18, height: 60 }}>
            {NAV.map((item) => {
              if ("children" in item) {
                const groupActive = item.children.some((c) => isActive(pathname, c.href));
                const open = openGroup === item.label;
                return (
                  <div
                    key={item.label}
                    onMouseEnter={() => setOpenGroup(item.label)}
                    onMouseLeave={() => setOpenGroup((g) => (g === item.label ? null : g))}
                    style={{ position: "relative", height: 60 }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenGroup((g) => (g === item.label ? null : item.label))}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "0 13px",
                        height: 60,
                        fontSize: 13,
                        fontWeight: groupActive ? 600 : 500,
                        color: groupActive ? "#16202e" : "#6a7484",
                        background: "none",
                        border: "none",
                        borderBottom: `2px solid ${groupActive || open ? "var(--accent)" : "transparent"}`,
                        whiteSpace: "nowrap",
                        cursor: "pointer",
                      }}
                    >
                      {item.label}
                      <span style={{ fontSize: 9, color: "#9aa3b0", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
                    </button>
                    {open && (
                      <div
                        style={{
                          position: "absolute",
                          top: 58,
                          left: 0,
                          minWidth: 188,
                          background: "#fff",
                          border: "1px solid #e6e8ec",
                          borderRadius: 9,
                          boxShadow: "0 10px 28px rgba(22,32,46,.12)",
                          padding: 6,
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          zIndex: 30,
                        }}
                      >
                        {item.children.map((c) => {
                          const childActive = isActive(pathname, c.href);
                          const childHovered = hovered === c.href;
                          return (
                            <Link
                              key={c.href}
                              href={c.href}
                              onClick={() => setOpenGroup(null)}
                              onMouseEnter={() => setHovered(c.href)}
                              onMouseLeave={() => setHovered((h) => (h === c.href ? null : h))}
                              style={{
                                display: "block",
                                padding: "9px 12px",
                                borderRadius: 6,
                                fontSize: 13,
                                fontWeight: childActive ? 600 : 500,
                                color: childActive ? "#16202e" : "#56616f",
                                background: childActive ? "#eef4f1" : childHovered ? "#f3f5f7" : "transparent",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {c.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0 13px",
                    height: 60,
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    color: active ? "#16202e" : "#6a7484",
                    borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 10, color: "#9aa3b0", textTransform: "uppercase", letterSpacing: ".6px", fontWeight: 600 }}>Engine</span>
            <div style={{ display: "flex", border: "1px solid #e0e3e8", borderRadius: 7, overflow: "hidden" }}>
              <button
                onClick={() => setEngine("live")}
                style={{ padding: "5px 10px", fontSize: 12, fontWeight: 600, background: live ? "#e9f4ef" : "#fff", color: live ? "#1f7a5a" : "#9aa3b0", display: "flex", alignItems: "center", gap: 5, border: "none" }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: live ? "#2f9e78" : "#cdd3db" }} />Live
              </button>
              <button
                onClick={() => setEngine("offline")}
                style={{ padding: "5px 10px", fontSize: 12, fontWeight: 600, background: !live ? "#eef1f5" : "#fff", color: !live ? "#5a6675" : "#9aa3b0", display: "flex", alignItems: "center", gap: 5, borderLeft: "1px solid #e0e3e8", borderTop: "none", borderRight: "none", borderBottom: "none" }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: !live ? "#9aa3b0" : "#cdd3db" }} />Offline
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Synthetic data band */}
      <div style={{ background: "#faf6ec", borderBottom: "1px solid #efe7d2" }}>
        <div style={{ maxWidth: 1260, margin: "0 auto", padding: "6px 28px", fontSize: 11.5, color: "#8a6d1f", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#b8860b" }} />
          Synthetic data only. No real Iovance contracts, vendors, or financials are used on this surface.
        </div>
      </div>

      <main style={{ flex: 1, maxWidth: 1260, width: "100%", margin: "0 auto", padding: "32px 28px 80px" }}>
        {children}
      </main>
    </div>
  );
}
