#!/bin/bash
# ============================================================================
# NebulaForge Creator Nebula - Global Test Runner
# ============================================================================
# Runs all frontend unit tests inside Docker for environment isolation.
# No local dependencies required beyond Docker.
#
# Usage: ./run_tests.sh
# ============================================================================

set -e

echo "============================================"
echo " NebulaForge Creator Nebula - Test Suite"
echo "============================================"
echo ""

FRONTEND_DIR="$(cd "$(dirname "$0")/frontend" && pwd)"

# Run tests inside Docker for full isolation
echo "[frontend][tests] Running frontend tests in Docker..."
echo ""

docker run --rm \
  -v "$FRONTEND_DIR":/app \
  -w /app \
  node:20-alpine \
  sh -c "npm ci --silent 2>/dev/null && npx vitest run --coverage --reporter=verbose 2>&1"

TEST_EXIT_CODE=$?

echo ""
echo "============================================"
echo " Test Summary"
echo "============================================"

if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo " Status:   PASSED"
  echo " Frontend: All tests passed"
else
  echo " Status:   FAILED"
  echo " Frontend: Some tests failed (exit code: $TEST_EXIT_CODE)"
fi

echo "============================================"

exit $TEST_EXIT_CODE
