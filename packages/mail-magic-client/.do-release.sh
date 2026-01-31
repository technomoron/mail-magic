#!/bin/sh

NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")

echo "Creating release for ${NAME}@${VERSION}"

git tag -a "${NAME}@${VERSION}" -m "Release ${NAME} ${VERSION}"
git push origin "${NAME}@${VERSION}"

npm publish --access=public
