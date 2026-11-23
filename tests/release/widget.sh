#!/usr/bin/env bash
set -euo pipefail

# Use local Git remotes and a registry stub so the release can never leave this fixture.
root=$(pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export FIXTURE="$work"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export WIDGET_NPM_VIEW_DELAY=0
mkdir "$work/bin"
cat > "$work/bin/bun" <<'STUB'
#!/usr/bin/env bash
set -eu
[[ $1 == install ]] && exit 0
echo edited-during-build > "$FIXTURE/repo/src/widget/index.ts"
[[ -z ${FAIL_BUILD:-} ]] || exit 1
mkdir -p dist
cp index.ts dist/widget.js
STUB
cat > "$work/bin/npm" <<'STUB'
#!/usr/bin/env bash
set -eu
case "$1" in
  whoami)
    case ${CHANGE_AT_CONFIRMATION:-} in
      branch) git switch -qc other ;;
      commit) git commit --allow-empty -qm advance ;;
    esac
    echo fixture
    ;;
  pack) tar -czf "$3/widget.tgz" package.json dist ;;
  publish)
    [[ ! -f "$FIXTURE/published" ]]
    cp "$2" "$FIXTURE/published"
    ;;
  view)
    [[ $* == *--prefer-online* ]]
    if [[ -f "$FIXTURE/view-fail-once" ]]; then
      rm "$FIXTURE/view-fail-once"
      exit 1
    fi
    node -e 'const fs=require("fs"),crypto=require("crypto"); console.log("sha512-"+crypto.createHash("sha512").update(fs.readFileSync(process.argv[1])).digest("base64"))' "$FIXTURE/published"
    ;;
  *) exit 1 ;;
esac
STUB
chmod +x "$work/bin/"*
export PATH="$work/bin:$PATH"
git init -q --bare "$work/origin"
git init -q -b main "$work/repo"
cd "$work/repo"
git config user.name Fixture
git config user.email fixture@example.invalid
mkdir -p src/widget/scripts Changelog/widget
cp "$root/Makefile" .
cp "$root/src/widget/scripts/release.sh" src/widget/scripts
cp "$root/src/widget/package.json" src/widget
echo 'dist/' > .gitignore
echo 'const widget = 1' > src/widget/index.ts
echo 'Release notes' > Changelog/widget/v2.0.0.md
git add .
git commit -qm fixture
git remote add origin "$work/origin"
git push -q origin main

expect_failure() {
  if "$@" <<< y >"$work/output" 2>&1; then
    echo "Unexpected success: $*" >&2
    exit 1
  fi
}

expect_failure env WIDGET_VERSION=2.0.0 bash src/widget/scripts/release.sh bogus
grep -q 'Usage:' "$work/output"
expect_failure env WIDGET_VERSION=2.0.0 bash src/widget/scripts/release.sh
grep -q 'Usage:' "$work/output"

git clone -q -b main "$work/origin" "$work/peer"
git -C "$work/peer" -c user.name=Peer -c user.email=peer@example.invalid commit --allow-empty -qm remote-advance
git -C "$work/peer" push -q origin main
expect_failure make release-widget v=2.0.0
grep -q 'Update main' "$work/output"
[[ ! -e "$work/published" ]]
git pull -q --ff-only origin main

echo 'dirty' >> src/widget/index.ts
expect_failure make release-widget v=2.0.0
grep -q 'local changes' "$work/output"
git restore src/widget/index.ts
touch src/widget/untracked.ts
expect_failure make release-widget v=2.0.0
grep -q 'local changes' "$work/output"
rm src/widget/untracked.ts

for change in branch commit; do
  expect_failure env CHANGE_AT_CONFIRMATION="$change" make release-widget v=2.0.0
  grep -q 'Checkout changed' "$work/output"
  git switch -q main
done
[[ ! -e "$work/published" ]]

expect_failure env FAIL_BUILD=1 make release-widget v=2.0.0
bump_commit=$(git rev-parse HEAD)
grep -q "git revert $bump_commit" "$work/output"
! grep -q 'git reset --hard' "$work/output"
grep -q edited-during-build src/widget/index.ts
git restore src/widget/index.ts
git revert --no-edit "$bump_commit" >/dev/null
[[ ! -e "$work/published" ]]

printf '#!/bin/sh\nexit 1\n' > "$work/origin/hooks/pre-receive"
chmod +x "$work/origin/hooks/pre-receive"
expect_failure make release-widget v=2.0.0
[[ -s "$work/published" ]]
[[ $(tar -xOzf "$work/published" dist/widget.js) == "$(git show HEAD:src/widget/index.ts)" ]]
grep -q edited-during-build src/widget/index.ts
git rev-parse --verify refs/tags/widget-v2.0.0 >/dev/null
[[ -z $(git ls-remote --tags origin) ]]
rm "$work/origin/hooks/pre-receive"
cp "$work/published" "$work/original"
echo 'wrong bytes' >> "$work/published"
expect_failure make finalize-widget v=2.0.0
grep -q 'integrity does not match' "$work/output"
[[ -z $(git ls-remote --tags origin) ]]
mv "$work/original" "$work/published"
touch "$work/view-fail-once"
make finalize-widget v=2.0.0
make finalize-widget v=2.0.0
[[ $(git --git-dir="$work/origin" rev-parse 'widget-v2.0.0^{commit}') == "$(git rev-parse HEAD)" ]]
[[ $(git --git-dir="$work/origin" rev-parse main) == "$(git rev-parse HEAD)" ]]
