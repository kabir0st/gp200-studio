#!/usr/bin/env bash
# Re-run a Ghidra headless extraction script against the already-analyzed
# GP-200.exe project. The one-time import+analysis is done; this reuses it,
# so each run is seconds, not minutes.
#
# Usage:  re/ghidra/run.sh <ScriptName.java> [OUT_ENV_VAR=path ...]
# Example: re/ghidra/run.sh ScanHeaderBuilders.java HB_OUT=/tmp/hb.txt
#
# First-time setup (import + full analysis, ~10-20 min) is documented in
# docs/windows-exe-reversing.md.
set -euo pipefail

GHIDRA_DIR="${GHIDRA_DIR:-$HOME/tools/ghidra_12.1.2_PUBLIC}"
PROJ_DIR="${PROJ_DIR:-$HOME/tools/ghidra_proj}"
PROJ_NAME="${PROJ_NAME:-gp200re}"
BIN="dumps/windows-exe/GP-200/GP-200.exe"
SCRIPT="${1:?usage: run.sh <ScriptName.java> [ENV=val ...]}"; shift || true

export GHIDRA_HEADLESS_MAXMEM="${GHIDRA_HEADLESS_MAXMEM:-8G}"
for kv in "$@"; do export "$kv"; done

if [ ! -d "$PROJ_DIR/$PROJ_NAME.rep" ]; then
  echo "No analyzed project at $PROJ_DIR/$PROJ_NAME -- doing one-time import+analysis..."
  "$GHIDRA_DIR/support/analyzeHeadless" "$PROJ_DIR" "$PROJ_NAME" \
    -import "$BIN" -scriptPath "$(dirname "$0")" -postScript "$SCRIPT"
else
  "$GHIDRA_DIR/support/analyzeHeadless" "$PROJ_DIR" "$PROJ_NAME" \
    -process GP-200.exe -noanalysis -scriptPath "$(dirname "$0")" -postScript "$SCRIPT"
fi
