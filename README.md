# ProcureIQ

One contract record, read once at signing — carried from legal review to the
quarter-close accrual. Two modules over one shared record:

- **ContractIQ** — first-pass contract review against the Iovance standard-terms
  playbook (extract the record, flag only the deviations, link amendments to their
  parent, commit a signed-off record).
- **BudgetIQ** — the same record matches invoices to POs, drafts the quarter-close
  accrual off the contract's payment schedule, and reforecasts against budget.

Prototype on **synthetic data only** — no real contracts, vendors, or financials.

## Quickstart (macOS)

```bash
git clone https://github.com/linjeffery888/procureiq.git
cd procureiq
./setup.sh         # checks for Node 20+ (installs it via Homebrew if missing), installs deps, builds
npm run demo       # serves http://localhost:3000
```

`setup.sh` is safe to re-run. If you don't have Homebrew it'll tell you the one
link to grab Node from, then re-run it.

## Run it manually

Requires **Node 20+** (`node -v` to check; install from https://nodejs.org or `brew install node`).

```bash
git clone https://github.com/linjeffery888/procureiq.git
cd procureiq
npm install
npm run build      # production build (compiles every route ahead of time)
npm run demo       # serves http://localhost:3000 with an auto-restart watchdog
```

Then open **http://localhost:3000** and click **▶ Run demo** (top-right). That
selects the live engine and auto-runs every module, so all the pass/flag/review
states are populated in one click. Enter any name at the "Who's reviewing?"
prompt — it signs the audit trail.

> Stop the server with **Ctrl-C** in that terminal. Never run `npm run build`
> while the server is up — rebuilding `.next` under a running server is the one
> thing that breaks it. Build first, then `npm run demo`.

## No API key needed

The deterministic engine (matching, dedup, contract-family linking, offline
extraction + triage) runs the money decisions with **no network and no API key** —
so a fresh clone works out of the box. To also exercise the live Claude first-pass:

```bash
cp .env.local.example .env.local
# then set ANTHROPIC_API_KEY in .env.local
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server with hot reload (for editing) |
| `npm run build` | Production build |
| `npm run demo` | Production server + watchdog (use this for a stable, long session) |
| `npm start` | Plain `next start` |

## Architecture, in one line

Next.js 14 + TypeScript over a deterministic core of pure functions. AI proposes;
the rules decide the money; a human approves. Every decision is signed to an
append-only audit trail, and the system degrades to the deterministic engine if
the model is ever unavailable.
