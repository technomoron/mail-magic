#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
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
		--)
			;;
		*)
			TARGETS+=("$(resolve_target "$arg")")
			;;
	esac
done

cd "$ROOT"

if [ "${#TARGETS[@]}" -gt 0 ]; then
	for target in "${TARGETS[@]}"; do
		bash "$ROOT/scripts/release-package-preflight.sh" "$target"
	done
	exit 0
fi

echo "Running workspace cleanbuild"
pnpm cleanbuild

echo "Running workspace tests"
pnpm test

echo "Running release checks (--local)"
if [ "${#TARGETS[@]}" -eq 0 ]; then
	bash "$ROOT/scripts/release-check.sh" --local
else
	bash "$ROOT/scripts/release-check.sh" --local "${TARGETS[@]}"
fi

echo "Release preflight completed."
