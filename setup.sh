#!/usr/bin/env bash
# One-command setup for ProcureIQ.
#   ./setup.sh
# Ensures Node 20+ is installed (via Homebrew on macOS if missing), installs
# dependencies, and builds. No API key required — the app runs offline by
# default. Safe to re-run.

NEED_MAJOR=20

have_node() { command -v node >/dev/null 2>&1; }
node_major() { node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1; }
node_ok() { have_node && [ "$(node_major)" -ge "$NEED_MAJOR" ] 2>/dev/null; }

echo "▸ ProcureIQ setup"

if node_ok; then
  echo "  Node $(node -v) found — OK."
else
  echo "  Node ${NEED_MAJOR}+ not found (have: $(node -v 2>/dev/null || echo none))."
  if command -v brew >/dev/null 2>&1; then
    echo "  Installing Node via Homebrew (this can take a couple of minutes)…"
    brew install node || { echo "  ✗ 'brew install node' failed. Install Node ${NEED_MAJOR}+ from https://nodejs.org and re-run ./setup.sh"; exit 1; }
    hash -r 2>/dev/null || true
  else
    echo ""
    echo "  Homebrew isn't installed, so this script can't auto-install Node."
    echo "  Do ONE of these, then re-run ./setup.sh:"
    echo "    • Easiest: download the LTS installer from https://nodejs.org"
    echo "    • Or install Homebrew, then re-run this script:"
    echo '        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    exit 1
  fi
fi

if ! node_ok; then
  echo "  ✗ Node ${NEED_MAJOR}+ still isn't on your PATH. Open a NEW terminal and re-run ./setup.sh"
  exit 1
fi

echo "  Using node $(node -v) · npm $(npm -v)"
echo "▸ Installing dependencies…"
npm install || { echo "  ✗ npm install failed."; exit 1; }
echo "▸ Building the production bundle…"
npm run build || { echo "  ✗ build failed."; exit 1; }

echo ""
echo "✓ Setup complete. Start the demo with:"
echo "      npm run demo"
echo "  then open http://localhost:3000 and click \"Run demo\" (top-right)."
