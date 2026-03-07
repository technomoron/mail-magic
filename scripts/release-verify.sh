#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="--local"
declare -a TARGETS=()

resolve_target() {
	local raw="$1"
	if [ -d "$raw" ]; then
		(cd "$raw" && pwd)
	else
		(cd "$ROOT" && cd "$raw" && pwd)
	fi
}

for arg in "$@"; do
	case "$arg" in
		--local|--ci)
			MODE="$arg"
			;;
		*)
			TARGETS+=("$(resolve_target "$arg")")
			;;
	esac
done

cd "$ROOT"

echo "Running workspace lint"
pnpm lint

echo "Running workspace tests"
pnpm test

echo "Running workspace build"
pnpm build

echo "Running release checks (${MODE})"
if [ "${#TARGETS[@]}" -eq 0 ]; then
	bash "$ROOT/scripts/release-check.sh" "$MODE"
else
	bash "$ROOT/scripts/release-check.sh" "$MODE" "${TARGETS[@]}"
fi

echo "Release verification completed."
