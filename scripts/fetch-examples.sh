#!/usr/bin/env bash
# Downloads the official Spine example projects from the spine-runtimes
# repository into ./examples/. These assets are owned by Esoteric Software and
# are NOT redistributed with this repository — see NOTICE.md.
#
# They are the yardstick: a hand-authored reference export to measure a compiled
# rig against. Each example's own license.txt is fetched alongside it, because
# the images may only be redistributed accompanied by that file (and never
# commercially); the .spine project files are public domain.
#
# The file list comes from the GitHub contents API rather than from guessed
# names — the examples do not share a naming scheme (some ship -ess exports,
# some -pro, spineboy ships a second `-run` atlas), and a guessed name that 404s
# is indistinguishable from an example that changed shape upstream.
#
# Unauthenticated API calls are rate-limited to 60/hour. Export GITHUB_TOKEN to
# lift that if you hit it.
set -euo pipefail

REF="4.3"
API="https://api.github.com/repos/EsotericSoftware/spine-runtimes/contents/examples"
RAW="https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/${REF}/examples"
DEST="$(cd "$(dirname "$0")/.." && pwd)/examples"

# The 12-principles series is the ladder (one principle per rig, in order of
# difficulty); spineboy is the graduation exam.
EXAMPLES=(
  1-weight-and-mass
  2-the-12-principles
  3-timing-and-spacing
  4-wave-principle
  5-squash-and-stretch
  6-arcs
  7-anticipation
  8-follow-through
  spineboy
)

# bash 3.2 (the macOS system shell) treats an empty array as unset under
# `set -u`, so the expansion below is guarded rather than written "${auth[@]}".
auth=()
if [ -n "${GITHUB_TOKEN:-}" ]; then auth=(-H "Authorization: Bearer ${GITHUB_TOKEN}"); fi

# Idempotent: an already-downloaded, non-empty file is kept, so this is safe to
# re-run and safe as a pre-task hook (a fresh clone has no examples — they are
# gitignored).
fetch() { # fetch <url> <path>
  if [ -s "$2" ]; then
    echo "    have $(basename "$2")"
  else
    echo "    get  $(basename "$2")"
    mkdir -p "$(dirname "$2")"
    curl -fsSL "$1" -o "$2"
  fi
}

# Every `download_url` in one contents-API listing. `null` (directories) does not
# match the quoted pattern, so it drops out on its own.
list_urls() { # list_urls <api-url>
  curl -fsSL ${auth[@]+"${auth[@]}"} "$1" | grep -o '"download_url": *"[^"]*"' | sed 's/.*"\(https[^"]*\)"$/\1/'
}

missing_license=()

for name in "${EXAMPLES[@]}"; do
  echo "$name"
  out="$DEST/$name"
  mkdir -p "$out"

  # export/ — the reference skeleton data and its atlas. The premultiplied-alpha
  # variants are skipped: rigc emits `pma: false` pages, and comparing against a
  # pma export would compare two different colour conventions.
  for url in $(list_urls "$API/$name/export?ref=$REF"); do
    file="$(basename "$url")"
    case "$file" in
      *-pma.atlas | *-pma.png | *-pma_*.png) continue ;;
      *.json | *.atlas | *.png) fetch "$url" "$out/export/$file" ;;
    esac
  done

  # images/ — the source art the atlas was packed from.
  for url in $(list_urls "$API/$name/images?ref=$REF"); do
    fetch "$url" "$out/images/$(basename "$url")"
  done

  # license.txt — the redistribution condition for the images above. Its absence
  # is reported rather than swallowed: it changes what may be done with the art.
  if curl -fsSL -o "$out/license.txt.tmp" "$RAW/$name/license.txt" 2>/dev/null; then
    mv "$out/license.txt.tmp" "$out/license.txt"
    echo "    ok   license.txt"
  else
    rm -f "$out/license.txt.tmp"
    missing_license+=("$name")
    echo "    WARN no license.txt upstream"
  fi
done

echo
echo "examples ready → $DEST"
if [ ${#missing_license[@]} -gt 0 ]; then
  echo
  echo "⚠️  no license.txt upstream for: ${missing_license[*]}"
  echo "    Treat those images as NOT redistributable — the sibling examples grant"
  echo "    redistribution only when accompanied by their license file, and this one"
  echo "    has no such file to accompany them with. See NOTICE.md."
fi
