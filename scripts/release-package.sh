#!/usr/bin/env bash
set -euo pipefail

PKG_DIR="${1:-$(pwd)}"
PKG_DIR="$(cd "$PKG_DIR" && pwd)"

if [ ! -f "$PKG_DIR/package.json" ]; then
	echo "Missing package.json at $PKG_DIR" >&2
	exit 1
fi

REPO_ROOT="$(git -C "$PKG_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$REPO_ROOT" ]; then
	echo "No git repo found for $PKG_DIR" >&2
	exit 1
fi

if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
	echo "Working tree is not clean in $REPO_ROOT. Commit or stash changes before release." >&2
	exit 1
fi

BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
UPSTREAM="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || true)"
if [ -z "$UPSTREAM" ]; then
	echo "No upstream configured for ${BRANCH} in ${REPO_ROOT}. Set upstream before release." >&2
	exit 1
fi

if ! git -C "$REPO_ROOT" fetch --quiet; then
	echo "Failed to fetch remote updates for ${REPO_ROOT}. Check network/remote access." >&2
	exit 1
fi

set -- $(git -C "$REPO_ROOT" rev-list --left-right --count "${UPSTREAM}...HEAD")
BEHIND="$1"
AHEAD="$2"
if [ "$BEHIND" -ne 0 ] || [ "$AHEAD" -ne 0 ]; then
	echo "Branch ${BRANCH} is not in sync with ${UPSTREAM} in ${REPO_ROOT} (behind ${BEHIND}, ahead ${AHEAD})." >&2
	echo "Pull/push until branch matches upstream before release." >&2
	exit 1
fi

NAME="$(node -p "require('$PKG_DIR/package.json').name")"
VERSION="$(node -p "require('$PKG_DIR/package.json').version")"
PRIVATE="$(node -p "Boolean(require('$PKG_DIR/package.json').private)")"

if [ "$PRIVATE" = "true" ]; then
	echo "Skip ${NAME}: private package."
	exit 0
fi

if git -C "$REPO_ROOT" rev-parse -q --verify "refs/tags/${NAME}@${VERSION}" >/dev/null; then
	echo "Skip ${NAME}: tag ${NAME}@${VERSION} already exists."
	exit 0
fi

LAST_TAG="$(git -C "$REPO_ROOT" tag -l "${NAME}@*" --sort=-v:refname | head -n1 || true)"
LAST_VERSION=""
if [ -n "$LAST_TAG" ]; then
	LAST_VERSION="${LAST_TAG##*@}"
fi

if [ -n "$LAST_VERSION" ]; then
	if ! node - "$VERSION" "$LAST_VERSION" <<'NODE'
const [current, previous] = process.argv.slice(2);
const normalize = (v) => v.replace(/^v/, '');
const parse = (v) => {
	const [main, pre] = normalize(v).split('-');
	const parts = main.split('.').map((n) => parseInt(n, 10) || 0);
	return { parts, pre: pre ? pre.split('.') : [] };
};
const compare = (a, b) => {
	for (let i = 0; i < 3; i += 1) {
		const ai = a.parts[i] || 0;
		const bi = b.parts[i] || 0;
		if (ai > bi) return 1;
		if (ai < bi) return -1;
	}
	if (!a.pre.length && !b.pre.length) return 0;
	if (!a.pre.length) return 1;
	if (!b.pre.length) return -1;
	const len = Math.max(a.pre.length, b.pre.length);
	for (let i = 0; i < len; i += 1) {
		const ai = a.pre[i];
		const bi = b.pre[i];
		if (ai === undefined) return -1;
		if (bi === undefined) return 1;
		const an = Number(ai);
		const bn = Number(bi);
		const aNum = String(an) === ai;
		const bNum = String(bn) === bi;
		if (aNum && bNum) {
			if (an > bn) return 1;
			if (an < bn) return -1;
			continue;
		}
		if (aNum && !bNum) return -1;
		if (!aNum && bNum) return 1;
		if (ai > bi) return 1;
		if (ai < bi) return -1;
	}
	return 0;
};
const result = compare(parse(current), parse(previous));
process.exit(result > 0 ? 0 : 1);
NODE
	then
		echo "Skip ${NAME}: version ${VERSION} is not newer than ${LAST_VERSION}."
		exit 0
	fi
fi

BASE_REF="$LAST_TAG"
if [ -z "$BASE_REF" ]; then
	BASE_REF="$(git -C "$REPO_ROOT" rev-list --max-parents=0 HEAD)"
fi

PKG_REL="$(node -e "const path=require('path'); console.log(path.relative(process.argv[1], process.argv[2]));" "$REPO_ROOT" "$PKG_DIR")"
if ! git -C "$REPO_ROOT" diff --name-only "$BASE_REF"..HEAD -- "$PKG_REL" | grep -q .; then
	echo "Skip ${NAME}: no changes since ${LAST_TAG:-initial commit}."
	exit 0
fi

CHANGES_FILE="$PKG_DIR/CHANGES"
if [ ! -f "$CHANGES_FILE" ]; then
	echo "Missing CHANGES file for ${NAME}: ${CHANGES_FILE}" >&2
	exit 1
fi

if ! awk -v v="$VERSION" '
	$1 == "Version" {
		line = $0
		sub(/^Version[[:space:]]+/, "", line)
		ver = line
		sub(/[[:space:]]+\(.*/, "", ver)
		if (ver == v) {
			found = 1
		}
	}
	END { exit(found ? 0 : 1) }
' "$CHANGES_FILE"; then
	echo "${CHANGES_FILE} is missing 'Version ${VERSION} (<YYYY-MM-DD>)' for ${NAME}." >&2
	echo "Add the version section before release." >&2
	exit 1
fi

echo "Publishing ${NAME}@${VERSION} from ${PKG_DIR}"
(
	cd "$PKG_DIR"
	npm run build --if-present

	if echo "$VERSION" | grep -q "-"; then
		tag_name="$(echo "$VERSION" | sed 's/^[0-9.]*-\([A-Za-z0-9]*\).*/\1/')"
		echo "Prerelease detected. Publishing with tag '${tag_name}'"
		npm publish --tag "$tag_name" --access public
	else
		npm publish --access public
	fi
)

git -C "$REPO_ROOT" tag -a "${NAME}@${VERSION}" -m "Release ${NAME} ${VERSION}"
echo "Released ${NAME}@${VERSION}. Push tags with: git push --tags"
