#!/bin/bash
# ============================================================================
# NebulaForge Creator Nebula - Global Test Runner
# ============================================================================
# Runs the frontend Vitest suite with coverage inside Docker.
#
# Usage: ./run_tests.sh
# ============================================================================

set -euo pipefail

echo "============================================"
echo " NebulaForge Creator Nebula - Test Suite"
echo "============================================"
echo ""

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[frontend][tests] Running Vitest with coverage inside Docker (node:20-alpine)..."
echo ""

cd "$REPO_DIR"
docker compose --profile test run --rm frontend-test

echo ""
echo "============================================"
echo " Test Summary"
echo "============================================"
echo " Status:   PASSED"
echo " Frontend: All tests passed"
echo "============================================"
