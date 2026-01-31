#!/bin/sh

NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")

echo "Creating release for ${NAME}@${VERSION}"

tag_ref="refs/tags/${NAME}@${VERSION}"
if git rev-parse -q --verify "$tag_ref" >/dev/null; then
	echo "Tag ${NAME}@${VERSION} already exists. Skipping tag creation."
else
	git tag -a "${NAME}@${VERSION}" -m "Release ${NAME} ${VERSION}"
	git push origin "${NAME}@${VERSION}"
fi

npm publish --access=public
