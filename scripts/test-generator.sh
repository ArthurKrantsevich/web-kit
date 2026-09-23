#!/usr/bin/env bash
# Generates a throwaway utility, runs every gate on it, then removes it.
set -euo pipefail
cd "$(dirname "$0")/.."

ID="gen-smoke"
cleanup() {
  rm -rf "packages/$ID" "apps/dashboard/src/tools/$ID"
  git checkout -- apps/dashboard/src/registry.ts apps/dashboard/src/tools/demos.tsx apps/dashboard/package.json pnpm-lock.yaml
  pnpm install --silent
}
trap cleanup EXIT

if [ -n "$(git status --porcelain -- apps/dashboard/src apps/dashboard/package.json pnpm-lock.yaml)" ]; then
  echo "commit dashboard changes before running this script"; exit 1
fi

pnpm turbo gen utility --args "$ID" "Gen & Smoke" data 'Encode & decode "quoted" text' < /dev/null
if grep -q '&amp;\|&quot;\|&#x27;' "packages/$ID/package.json" "apps/dashboard/src/tools/$ID/meta.ts"; then
  echo "generator HTML-escaped the title or description"; exit 1
fi
pnpm install --silent
pnpm turbo run typecheck test check --filter "@web-kit/$ID" --filter @web-kit/dashboard --force
pnpm --filter @web-kit/dashboard e2e -g "$ID"
echo "test-generator OK"
