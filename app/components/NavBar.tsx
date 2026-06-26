"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The single platform nav. ProcureIQ is ONE shell exposing the two modules and
// the shared Knowledge layer. Active state is derived from the path so the user
// always knows which surface they are on. Dollars live only on the Impact tab,
// keeping the working surfaces clean (internal-tool framing).
const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/contract-review", label: "ContractIQ" },
  { href: "/invoice-matching", label: "BudgetIQ · Invoices" },
  { href: "/financial-planning", label: "BudgetIQ · Planning" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/impact", label: "Impact" },
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : ""}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
