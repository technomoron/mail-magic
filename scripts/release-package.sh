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

echo "Publishing ${NAME}@${VERSION} from ${PKG_DIR}"
(
	cd "$PKG_DIR"
	pnpm run --if-present build

	if echo "$VERSION" | grep -q "-"; then
		tag_name="$(echo "$VERSION" | sed 's/^[0-9.]*-\([A-Za-z0-9]*\).*/\1/')"
		echo "Prerelease detected. Publishing with tag '${tag_name}'"
		pnpm publish --tag "$tag_name" --access public
	else
		pnpm publish --access public
	fi
)

git -C "$REPO_ROOT" tag -a "${NAME}@${VERSION}" -m "Release ${NAME} ${VERSION}"
echo "Released ${NAME}@${VERSION}. Push tags with: git push --tags"
