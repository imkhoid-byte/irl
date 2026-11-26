#!/usr/bin/env bash
# Checks that must stay green after touching ONCE's core rules.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
export NODE_NO_WARNINGS=1
echo "▸ typecheck";  npm run -s typecheck
echo "▸ lint";       npm run -s lint
echo "▸ unit, MCP and eval self-checks"; npx vitest run --reporter=dot
echo "▸ reference eval (must be 100%)"
npm run -s eval -- --agent reference --out "$(mktemp -d)" | grep -E "^\*\*Pass rate" | tee /dev/stderr | grep -q "= 100%"
echo "✓ all checks passed"
