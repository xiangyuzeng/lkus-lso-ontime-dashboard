#!/usr/bin/env bash
# One-shot setup for the LSO on-time daily refresh container.
# Run this from the pipeline/ directory ON THE INTERNAL HOST (dbtools02).
#
#   ./setup.sh          # 1st run: creates .env and tells you what to fill in
#   (edit .env)
#   ./setup.sh          # 2nd run: validates, builds, starts, tails the first run
#
# Safe to re-run any time; it just (re)builds and restarts the container.
set -euo pipefail
cd "$(dirname "$0")"

echo "== LSO on-time daily refresh — setup =="

# 1. Tooling check
command -v docker >/dev/null 2>&1 || { echo "ERROR: docker is not installed on this host."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "ERROR: 'docker compose' (v2) is not available."; exit 1; }

# 2. Ensure .env exists
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo
  echo "Created .env from the template. Now EDIT .env and fill in:"
  echo "    IEHR_HOST              (iEHR RDS endpoint)"
  echo "    OPEMPEFFICIENCY_HOST   (opempefficiency RDS endpoint)"
  echo "    GITHUB_TOKEN           (PAT with Contents:write on the repo)"
  echo "  (AWS_REGION / MYSQL_SECRET_NAME / GITHUB_* / schedule are pre-filled.)"
  echo
  echo "Tip: IEHR_HOST / OPEMPEFFICIENCY_HOST / GITHUB_TOKEN are the SAME values"
  echo "the lkus-lso-train-dashboard refresh uses — you can copy them from its .env."
  echo
  echo "Then run ./setup.sh again."
  exit 0
fi

# 3. Verify required values are filled
missing=0
for k in IEHR_HOST OPEMPEFFICIENCY_HOST GITHUB_TOKEN; do
  v="$(grep -E "^${k}=" .env | cut -d= -f2- || true)"
  if [[ -z "${v// /}" ]]; then echo "  MISSING in .env: $k"; missing=1; fi
done
if [[ $missing -ne 0 ]]; then
  echo "Fill the missing value(s) in .env, then re-run ./setup.sh"
  exit 1
fi

# 4. Build + start (runs a refresh immediately on startup, then daily)
echo "Building and starting the container..."
docker compose up -d --build

echo
echo "Started. The container just kicked off the first refresh and will repeat daily."
echo "Watching the first run now (Ctrl+C to stop watching — the container keeps running):"
echo "-----------------------------------------------------------------------------------"
docker compose logs -f
