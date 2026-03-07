#!/usr/bin/env bash
set -euo pipefail

PKG_DIR="${1:-$(pwd)}"
PKG_DIR="$(cd "$PKG_DIR" && pwd)"

if [ ! -f "$PKG_DIR/package.json" ]; then
	echo "Missing package.json at $PKG_DIR" >&2
	exit 1
fi

echo "Running cleanbuild for $(basename "$PKG_DIR")"
pnpm --dir "$PKG_DIR" run cleanbuild

echo "Running tests for $(basename "$PKG_DIR")"
pnpm --dir "$PKG_DIR" run test

echo "Running release check (--local) for $(basename "$PKG_DIR")"
pnpm --dir "$PKG_DIR" run release:check -- --local

echo "Package release preflight completed for $(basename "$PKG_DIR")."
