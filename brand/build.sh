#!/usr/bin/env bash
# Builds a branded copy of this repository. Files in this checkout are never edited: the profile is applied to a
# fresh copy in --out, then the copy is built and scanned for leftovers of the upstream brand. See brand/README.md.
#
#   brand/build.sh --profile brand/profiles/<name> --out <dir> [--target web|desktop|mobile|none] [--dirty] [--env <file>]
#
#   --target  what to build after applying the profile (default: web, which builds the web app and the server)
#   --dirty   copy the working tree (tracked + untracked, not ignored) instead of the committed HEAD
#   --env     the values brand.json reads as ${NAME} (default: the profile's brand.env, kept out of git; see brand.env.example)
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
PROFILE="" OUT="" TARGET="web" DIRTY=0 ENV_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE=$2; shift 2 ;;
    --out) OUT=$2; shift 2 ;;
    --target) TARGET=$2; shift 2 ;;
    --dirty) DIRTY=1; shift ;;
    --env) ENV_FILE=$2; shift 2 ;;
    *) echo "brand/build.sh: unknown option $1" >&2; exit 64 ;;
  esac
done

if [ -z "$PROFILE" ] || [ ! -f "$PROFILE/brand.json" ]; then
  echo "brand/build.sh: --profile <dir with brand.json> is required. A build without a profile would ship the upstream brand." >&2
  exit 64
fi
if [ -z "$OUT" ]; then echo "brand/build.sh: --out <dir> is required" >&2; exit 64; fi
PROFILE=$(cd "$PROFILE" && pwd)
# Values that belong to whoever builds (repository, app ids): from --env, else the profile's brand.env, else the
# environment. In GitHub Actions the repository defaults to the one running the workflow.
[ -z "$ENV_FILE" ] && [ -f "$PROFILE/brand.env" ] && ENV_FILE="$PROFILE/brand.env"
if [ -n "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
[ -z "${BRAND_REPO:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ] && export BRAND_REPO="$GITHUB_REPOSITORY"
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
case "$OUT/" in "$ROOT/"*) echo "brand/build.sh: --out must be outside the repository ($ROOT)" >&2; exit 64 ;; esac
case "$ROOT/" in "$OUT/"*) echo "brand/build.sh: --out must not contain the repository" >&2; exit 64 ;; esac

echo "brand: copying $( [ $DIRTY = 1 ] && echo 'working tree' || echo HEAD ) to $OUT"
find "$OUT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
if [ $DIRTY = 1 ]; then
  (cd "$ROOT" && git ls-files -z --cached --others --exclude-standard | while IFS= read -r -d '' f; do [ -e "$f" ] && printf '%s\0' "$f"; done | tar --null -T - -cf -) | tar -x -C "$OUT"
else
  git -C "$ROOT" archive HEAD | tar -x -C "$OUT"
fi

mkdir -p "$OUT/.brand"
echo "brand: applying $PROFILE"
bun "$ROOT/brand/apply.ts" --src "$OUT" --profile "$PROFILE" --report "$OUT/.brand/report.json"

[ "$TARGET" = none ] && { echo "brand: applied, nothing built (--target none)"; exit 0; }

cd "$OUT"
bun install --frozen-lockfile

# Artwork drawn by the repo's own generators (app icons, favicon, email art, desktop icons): rerun them so they draw
# the profile's character. The profile lists the commands: "generate": { "all": [...], "desktop": [...] }.
generate() {
  bun -e 'const g = JSON.parse(await Bun.file(process.argv[1]).text()).generate ?? {}; for (const c of g[process.argv[2]] ?? []) console.log(c)' "$PROFILE/brand.json" "$1" |
    while IFS= read -r cmd; do echo "brand: generate: $cmd"; sh -c "$cmd"; done
}
generate all
[ "$TARGET" = desktop ] && generate desktop
# Files the profile ships over the generators' output (a 3D app icon, the social card).
bun -e 'const a = JSON.parse(await Bun.file(process.argv[1]).text()).afterGenerate ?? {}; for (const [to, from] of Object.entries(a)) console.log(`${to}\t${from}`)' "$PROFILE/brand.json" |
  while IFS="$(printf '\t')" read -r to from; do mkdir -p "$(dirname "$to")"; cp "$PROFILE/$from" "$to"; echo "brand: asset after generate: $to"; done
case "$TARGET" in
  web)
    bun run build
    bun "$ROOT/brand/scan.ts" apps/web/dist --kept .brand/report.json --report .brand/scan-web.json
    # With a renamed right hand, its upstream name must not reach the screens (identifiers like isLodi are fine).
    if grep -q '"rightHand"' "$PROFILE/brand.json" && grep -rlE "[\"'\` >(]Lodi[\"'\` ,.:;<!?)]" apps/web/dist --include='*.js' --include='*.html'; then
      echo "brand: the upstream right hand's name is left in the web build (files above)" >&2
      exit 1
    fi
    ;;
  desktop)
    bun run --filter '@agenteschat/desktop' build
    bun "$ROOT/brand/scan.ts" apps/desktop/dist --kept .brand/report.json --report .brand/scan-desktop.json
    bun "$ROOT/brand/scan.ts" apps/desktop/src-tauri/src --source --kept .brand/report.json --report .brand/scan-rust.json
    echo "brand: front built. Native app: cd $OUT/apps/desktop && bun run tauri build (signing is up to you)"
    ;;
  mobile)
    bun "$ROOT/brand/scan.ts" apps/mobile --source --kept .brand/report.json --report .brand/scan-mobile.json
    echo "brand: source ready. Native app: cd $OUT/apps/mobile && npx expo prebuild (then your usual EAS or local build)"
    ;;
  *) echo "brand/build.sh: unknown --target $TARGET" >&2; exit 64 ;;
esac
echo "brand: done. Reports in $OUT/.brand/"
