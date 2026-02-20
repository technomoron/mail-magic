#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

if [ -d "$ROOT/packages/server" ] && [ -d "$ROOT/packages/client" ]; then
	PACKAGE_DIRS=(
		"$ROOT/packages/server"
		"$ROOT/packages/client"
	)
else
	PACKAGE_DIRS=(
		"$ROOT"
		"$ROOT/../mail-magic-client"
	)
fi

repo_roots=()
package_repos=()
for pkg_dir in "${PACKAGE_DIRS[@]}"; do
	if [ ! -f "$pkg_dir/package.json" ]; then
		echo "Missing package.json at $pkg_dir" >&2
		exit 1
	fi

	repo_root="$(git -C "$pkg_dir" rev-parse --show-toplevel 2>/dev/null || true)"
	if [ -z "$repo_root" ]; then
		echo "No git repo found for $pkg_dir" >&2
		exit 1
	fi

	package_repos+=("$repo_root")
	if [[ ! " ${repo_roots[*]} " =~ " ${repo_root} " ]]; then
		repo_roots+=("$repo_root")
	fi
done

# Preflight: ensure all repos are clean before any action.
dirty=0
for repo_root in "${repo_roots[@]}"; do
	if [ -n "$(git -C "$repo_root" status --porcelain)" ]; then
		echo "Working tree is not clean in $repo_root" >&2
		dirty=1
	fi
done

if [ "$dirty" -ne 0 ]; then
	echo "Commit or stash changes before release." >&2
	exit 1
fi

version_is_newer() {
	local current="$1"
	local previous="$2"
	node - "$current" "$previous" <<'NODE'
// When running `node - <args...>`, argv[1] is the script name ('-'), so args start at argv[2].
const [current, previous] = process.argv.slice(2);
const normalize = (v) => v.replace(/^v/, "");
const parse = (v) => {
	const [main, pre] = normalize(v).split("-");
	const parts = main.split(".").map((n) => parseInt(n, 10) || 0);
	return { parts, pre: pre ? pre.split(".") : [] };
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
}

publish_targets=()

for i in "${!PACKAGE_DIRS[@]}"; do
	pkg_dir="${PACKAGE_DIRS[$i]}"
	repo_root="${package_repos[$i]}"

	name="$(node -p "require('$pkg_dir/package.json').name")"
	version="$(node -p "require('$pkg_dir/package.json').version")"

	last_tag="$(git -C "$repo_root" tag -l "${name}@*" --sort=-v:refname | head -n1 || true)"
	last_version=""
	if [ -n "$last_tag" ]; then
		last_version="${last_tag##*@}"
	fi

	pkg_rel="$(node -e "const path=require('path'); console.log(path.relative(process.argv[1], process.argv[2]));" "$repo_root" "$pkg_dir")"
	base_ref="$last_tag"
	if [ -z "$base_ref" ]; then
		base_ref="$(git -C "$repo_root" rev-list --max-parents=0 HEAD)"
	fi

	changed="false"
	if git -C "$repo_root" diff --name-only "$base_ref"..HEAD -- "$pkg_rel" | grep -q .; then
		changed="true"
	fi

	version_newer="true"
	if [ -n "$last_version" ]; then
		if ! version_is_newer "$version" "$last_version"; then
			version_newer="false"
		fi
	fi

	if git -C "$repo_root" rev-parse -q --verify "refs/tags/${name}@${version}" >/dev/null; then
		echo "Skip ${name}: tag ${name}@${version} already exists."
		continue
	fi

	if [ "$changed" = "true" ] && [ "$version_newer" = "true" ]; then
		publish_targets+=("$pkg_dir|$repo_root|$name|$version")
	else
		if [ "$changed" != "true" ]; then
			echo "Skip ${name}: no changes since ${last_tag:-initial commit}."
		elif [ "$version_newer" != "true" ]; then
			echo "Skip ${name}: version ${version} is not newer than ${last_version}."
		fi
	fi
done

if [ "${#publish_targets[@]}" -eq 0 ]; then
	echo "No packages eligible for release."
	exit 0
fi

for target in "${publish_targets[@]}"; do
	IFS="|" read -r pkg_dir repo_root name version <<< "$target"

	echo "Publishing ${name}@${version} from ${pkg_dir}"
	(
		cd "$pkg_dir"
		npm run build --if-present

		if echo "$version" | grep -q "-"; then
			tag_name="$(echo "$version" | sed 's/^[0-9.]*-\([A-Za-z0-9]*\).*/\1/')"
			echo "Prerelease detected. Publishing with tag '${tag_name}'"
			npm publish --tag "$tag_name" --access public
		else
			npm publish --access public
		fi
	)

	git -C "$repo_root" tag -a "${name}@${version}" -m "Release ${name} ${version}"
done

echo "Release complete. Push tags with: git push --tags"
