#!/usr/bin/env bash
# Air cloud startup: installs dependencies for the Skill Atlas CLI (Node >= 24, TypeScript run natively).
# WARMUP run (snapshot baking) also proves the environment with the CI checks: typecheck, tests, CLI smoke.
set -euo pipefail

if [ "${AIR_STARTUP_MODE:-}" = warmup ]; then WARMUP=1; else WARMUP=; fi

cd "$(dirname "$0")/../.."

healthcheck() {
  echo "[healthcheck] typecheck"
  npm run typecheck
  echo "[healthcheck] tests"
  npm test
  echo "[healthcheck] CLI smoke on ./fixture"
  ./skill-atlas help >/dev/null
  ./skill-atlas scan ./fixture
  echo "[healthcheck] OK"
}

echo "[startup] node $(node -v), npm $(npm -v)"
node -e 'const [maj]=process.versions.node.split(".").map(Number); if (maj < 24) { console.error("Node >= 24 required, found " + process.version); process.exit(1) }'

chmod +x ./skill-atlas

echo "[startup] npm ci"
npm ci --no-audit --no-fund
echo "[startup] dependencies installed"

if [ -n "${WARMUP:-}" ]; then healthcheck; fi
echo "[startup] done"
