import "./globals.css";
import type { Metadata } from "next";
import { EngineProvider } from "./components/engine";
import { ReviewerProvider } from "./components/reviewer";
import Shell from "./components/Shell";

export const metadata: Metadata = {
  title: "ProcureIQ – Iovance IT procurement intelligence",
  description:
    "One platform, one shared contract record, two modules. ContractIQ reads each contract once; BudgetIQ reuses the same record to match invoices and draft accruals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <EngineProvider>
          <ReviewerProvider>
            <Shell>{children}</Shell>
          </ReviewerProvider>
        </EngineProvider>
      </body>
    </html>
  );
}
