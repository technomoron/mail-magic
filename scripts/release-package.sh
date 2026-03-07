#!/usr/bin/env bash
set -euo pipefail

PKG_DIR="${1:-$(pwd)}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_DIR="$(cd "$PKG_DIR" && pwd)"

set +e
bash "$SCRIPT_DIR/release-package-check.sh" "$PKG_DIR" --strict-ready
status=$?
set -e

if [ "$status" -eq 3 ]; then
	exit 0
fi
if [ "$status" -ne 0 ]; then
	exit "$status"
fi

NAME="$(node -p "require('$PKG_DIR/package.json').name")"
VERSION="$(node -p "require('$PKG_DIR/package.json').version")"
REPO_ROOT="$(git -C "$PKG_DIR" rev-parse --show-toplevel)"

bash "$SCRIPT_DIR/release-package-publish.sh" "$PKG_DIR"

git -C "$REPO_ROOT" tag -a "${NAME}@${VERSION}" -m "Release ${NAME} ${VERSION}"
echo "Released ${NAME}@${VERSION}. Push tags with: git push --tags"
