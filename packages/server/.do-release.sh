#!/bin/sh

NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")

echo "Creating release for ${NAME}@${VERSION}"

if [ -n "$(git status --porcelain)" ]; then
	echo "Working tree is not clean. Commit or stash changes before release." >&2
	exit 1
fi

UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || true)
if [ -z "$UPSTREAM" ]; then
	echo "No upstream configured for $(git rev-parse --abbrev-ref HEAD). Set upstream before release." >&2
	exit 1
fi

if ! git fetch --quiet; then
	echo "Failed to fetch remote updates. Check your network or remote access." >&2
	exit 1
fi

set -- $(git rev-list --left-right --count "${UPSTREAM}...HEAD")
BEHIND_COUNT=$1
AHEAD_COUNT=$2

if [ "$BEHIND_COUNT" -ne 0 ] || [ "$AHEAD_COUNT" -ne 0 ]; then
	echo "Branch is not in sync with ${UPSTREAM} (behind ${BEHIND_COUNT}, ahead ${AHEAD_COUNT})." >&2
	echo "Pull/push until the branch matches upstream before release." >&2
	exit 1
fi

if ! npm whoami >/dev/null 2>&1; then
	echo "Not logged into npm. Run 'npm login' before release." >&2
	exit 1
fi

tag_ref="refs/tags/${NAME}@${VERSION}"
if git rev-parse -q --verify "$tag_ref" >/dev/null; then
	echo "Tag ${NAME}@${VERSION} already exists. Skipping tag creation."
else
	git tag -a "${NAME}@${VERSION}" -m "Release ${NAME} ${VERSION}"
	git push origin "${NAME}@${VERSION}"
fi

# detect prerelease versions (contains a hyphen)
if echo "$VERSION" | grep -q "-"; then
  TAG=$(echo "$VERSION" | sed 's/^[0-9.]*-\([a-zA-Z0-9]*\).*/\1/')
  echo "Detected prerelease. Publishing with tag '$TAG'"
  npm publish --tag "$TAG" --access=public
else
  echo "Stable release. Publishing as latest"
  npm publish --access=public
fi
