import DashboardClient from "./components/DashboardClient";

// The platform dashboard. A thin server wrapper so the route can carry its own
// title; all the interactive work (expandable at-a-glance tiles, the animated
// lifecycle diagram) lives in the client component.

export const metadata = { title: "ProcureIQ – Dashboard" };

export default function Dashboard() {
  return <DashboardClient />;
}
