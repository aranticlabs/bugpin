#!/usr/bin/env bash
set -euo pipefail

fail() { echo "$*" >&2; exit 1; }

version=${WIDGET_VERSION:-}
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Specify a stable widget version with v=X.Y.Z."
tag="widget-v$version"
[[ $(git branch --show-current) == main ]] || fail "Run widget releases on main."
manifest=src/widget/package.json
package=$(node -p "require('./$manifest').name")

require_clean_tree() {
  local status
  status=$(git status --porcelain --untracked-files=all --ignore-submodules)
  [[ -z $status ]] || fail "Commit or remove local changes before releasing the widget."
}

case "${1:-}" in
  release-widget)
    release_commit=$(git rev-parse HEAD)
    require_clean_tree
    git cat-file -e "$release_commit:Changelog/widget/v$version.md" || fail "Commit the widget changelog first."
    remote_tag=$(git ls-remote --tags origin "refs/tags/$tag")
    [[ -z $remote_tag ]] || fail "$tag already exists on origin."
    git fetch --no-tags origin refs/heads/main
    git merge-base --is-ancestor FETCH_HEAD HEAD ||
      fail "Local main is not up to date with origin/main. Update main first."

    npm whoami
    read -r -p "Publish $package@$version to npm? [y/N] " confirm
    [[ $confirm == [Yy] ]] || fail "Release canceled."

    [[ $(git branch --show-current) == main && $(git rev-parse HEAD) == "$release_commit" ]] ||
      fail "Checkout changed during release confirmation. Restart the release."
    require_clean_tree

    bumped=0
    current=$(node -p "require('./$manifest').version")
    if [[ $current != "$version" ]]; then
      git show-ref --verify --quiet "refs/tags/$tag" && fail "Local $tag already exists for a different version."
      node -e 'const fs=require("fs"); const [file,version]=process.argv.slice(1); const p=JSON.parse(fs.readFileSync(file)); p.version=version; fs.writeFileSync(file,JSON.stringify(p,null,2)+"\n");' "$manifest" "$version"
      git commit -s -m "chore(widget): bump version to $version" -- "$manifest"
      release_commit=$(git rev-parse HEAD)
      bumped=1
    fi

    work=$(mktemp -d)
    trap 'rm -rf "$work"' EXIT
    mkdir "$work/source"
    git archive "$release_commit" | tar -x -C "$work/source"
    if ! (cd "$work/source" && bun install --frozen-lockfile && cd src/widget && bun run build && npm pack --pack-destination "$work"); then
      if (( bumped )); then
        echo "A version bump commit ($release_commit) was created in this run. To undo it, run: git revert $release_commit" >&2
      fi
      fail "Widget build or pack failed."
    fi
    packages=("$work"/*.tgz)
    archive=${packages[0]}
    integrity=$(node -e 'const fs=require("fs"), crypto=require("crypto"); console.log("sha512-"+crypto.createHash("sha512").update(fs.readFileSync(process.argv[1])).digest("base64"));' "$archive")

    if git show-ref --verify --quiet "refs/tags/$tag"; then
      [[ $(git rev-parse "$tag^{commit}") == "$release_commit" &&
         $(git for-each-ref --format='%(contents:subject)' "refs/tags/$tag") == "$integrity" ]] ||
        fail "Local $tag does not match this build. If npm never received the package, delete it with 'git tag -d $tag' and rerun; if it was published, run 'make finalize-widget v=$version'."
    else
      git tag -a "$tag" -m "$integrity" "$release_commit"
    fi
    echo "After a successful or interrupted publication, run make finalize-widget v=$version to finish."
    npm publish "$archive" --access public
    ;;
  finalize-widget)
    ;;
  *)
    fail "Usage: $0 <release-widget|finalize-widget>"
    ;;
esac

# The local tag binds the packed bytes to the release commit before npm receives them.
expected=$(git for-each-ref --format='%(contents:subject)' "refs/tags/$tag")
[[ $expected == sha512-* ]] || fail "The local release tag $tag has no package integrity."
published=""
view_attempts=${WIDGET_NPM_VIEW_ATTEMPTS:-6}
view_delay=${WIDGET_NPM_VIEW_DELAY:-5}
for ((attempt = 1; attempt <= view_attempts; attempt++)); do
  published=$(npm view "$package@$version" dist.integrity --prefer-online || true)
  [[ $published == "$expected" ]] && break
  if (( attempt < view_attempts && view_delay > 0 )); then
    sleep "$view_delay"
  fi
done
[[ $published == "$expected" ]] || fail "npm integrity does not match the prepared release."
release_commit=$(git rev-parse "$tag^{commit}")
git fetch --no-tags origin refs/heads/main
if git merge-base --is-ancestor "$release_commit" FETCH_HEAD; then
  git push origin "refs/tags/$tag"
else
  git push --atomic origin "$release_commit:refs/heads/main" "refs/tags/$tag"
fi
echo "Published $package@$version and pushed $tag."
