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
# some -pro, 7-anticipation's skeleton is called sack-pro, spineboy ships a
# second `-run` atlas), and a guessed name that 404s is indistinguishable from
# an example that changed shape upstream.
#
# Unauthenticated API calls are rate-limited to 60/hour. Export GITHUB_TOKEN to
# lift that; when the limit is hit anyway, `known_files` below is used as a static
# fallback so a rate-limited machine can still fetch from raw.githubusercontent.
#
# 🚨 The script must never report success on an empty download. A listing that
# 403s produces no URLs, and a loop over no URLs does nothing at all — which is
# how this script used to print "examples ready" and exit 0 with an empty
# examples/ directory. Every example is verified to hold at least one skeleton
# JSON before the exit status is allowed to be 0.
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

# Static fallback, recorded from a successful contents-API fetch on 2026-08-22
# (branch 4.3). It is deliberately second: a hardcoded list cannot notice that an
# example changed shape upstream, so it is only consulted when the API refuses to
# answer. `-pma` variants are omitted here for the same reason they are filtered
# out of the API listing — rigc emits straight-alpha pages and comparing against a
# premultiplied export would compare two different colour conventions.
known_files() { # known_files <example> <export|images>
  case "$1/$2" in
    1-weight-and-mass/export) echo "1-weight-and-mass-balls-ess.json 1-weight-and-mass-drop-ess.json 1-weight-and-mass.atlas 1-weight-and-mass.png" ;;
    1-weight-and-mass/images) echo "beach-ball.png blue-rubber-ball.png cast-shadow-beach.png cast-shadow-blue.png cast-shadow-iron.png cast-shadow-red.png ground-bg.png ground-cover.png red-rubber-ball.png rock.png steel-ball.png stick.png sword.png" ;;
    2-the-12-principles/export) echo "2-the-12-principles-ess.json 2-the-12-principles.atlas 2-the-12-principles.png" ;;
    2-the-12-principles/images) echo "basket-ball.png basket-lambertian.png billiard-ball.png billiard-lambertian.png billiard-specular.png bowling-ball.png bowling-lambertian.png bowling-specular.png obstacle-course.png platform.png ring-big.png ring-small.png tennis-ball.png tennis-lambertian.png water.png" ;;
    3-timing-and-spacing/export) echo "3-timing-and-spacing-ess.json 3-timing-and-spacing.atlas 3-timing-and-spacing.png" ;;
    3-timing-and-spacing/images) echo "pendulum.png square.png" ;;
    4-wave-principle/export) echo "4-wave-principle-ess.json 4-wave-principle.atlas 4-wave-principle.png" ;;
    4-wave-principle/images) echo "basket-ball.png basket-lambertian.png chain-1.png chain-2.png chain-3.png chain-4.png chain-end.png platform.png" ;;
    5-squash-and-stretch/export) echo "5-squash-and-stretch-ess.json 5-squash-and-stretch.atlas 5-squash-and-stretch.png" ;;
    5-squash-and-stretch/images) echo "ball.png belt-ends.png course.png hair-1.png hair-2.png head.png hood-end1a.png hood-end1b.png hood-end1c.png hood-end1d.png hood-end1e.png hood-end1f.png hood-end2a.png hood-end2b.png hood-end2c.png hood-end2d.png hood-end2e.png hood-end2f.png left-foot-bent01.png left-foot-bent02.png left-foot-side.png left-foot.png left-hand.png right-foot-bent01.png right-foot-bent02.png right-foot-side.png right-foot.png right-hand.png torso.png" ;;
    6-arcs/export) echo "6-arcs-pro.json 6-arcs.atlas 6-arcs.png" ;;
    6-arcs/images) echo "arc-tracker.png ball.png platform.png tail.png" ;;
    7-anticipation/export) echo "7-anticipation.atlas 7-anticipation.png sack-pro.json" ;;
    7-anticipation/images) echo "cape-back.png cape-front.png sack.png" ;;
    8-follow-through/export) echo "8-follow-through-pro-ball.json 8-follow-through-pro-pendulum.json 8-follow-through.atlas 8-follow-through.png" ;;
    8-follow-through/images) echo "ball.png chain-1.png chain-2.png chain-3.png chain-4.png chain-end.png platform.png tail.png" ;;
    spineboy/export) echo "spineboy-ess.json spineboy-pro.json spineboy-run.atlas spineboy-run.png spineboy.atlas spineboy.png" ;;
    spineboy/images) echo "crosshair.png eye-indifferent.png eye-surprised.png front-bracer.png front-fist-closed.png front-fist-open.png front-foot.png front-shin.png front-thigh.png front-upper-arm.png goggles.png gun.png head.png hoverboard-board.png hoverboard-thruster.png hoverglow-small.png mouth-grind.png mouth-oooo.png mouth-smile.png muzzle-glow.png muzzle-ring.png muzzle01.png muzzle02.png muzzle03.png muzzle04.png muzzle05.png neck.png portal-bg.png portal-flare1.png portal-flare2.png portal-flare3.png portal-shade.png portal-streaks1.png portal-streaks2.png rear-bracer.png rear-foot.png rear-shin.png rear-thigh.png rear-upper-arm.png torso.png" ;;
    *) echo "" ;;
  esac
}

# bash 3.2 (the macOS system shell) treats an empty array as unset under
# `set -u`, so the expansion below is guarded rather than written "${auth[@]}".
#
# The header goes to api.github.com only. That is the host with the 60/hour
# unauthenticated limit; raw.githubusercontent.com serves this public repository
# without credentials, and sending a token there only adds a way to fail.
auth=()
if [ -n "${GITHUB_TOKEN:-}" ]; then auth=(-H "Authorization: Bearer ${GITHUB_TOKEN}"); fi

# ---------------------------------------------------------------------------
# Retry — issue #335. Bounded, with backoff, and loud when it is spent.
# ---------------------------------------------------------------------------
#
# PR #331's first CI run failed this step with `curl: (35) Recv failure:
# Connection reset by peer` on several files, ending in `✗ no skeleton JSON was
# fetched for: 7-anticipation`. Typecheck, lint and selftest never ran; a plain
# re-run went green. One upstream blip cost a human a re-run.
#
# 🚨 The retry lives HERE rather than around the step in ci.yml, and the reason
# is not style:
#
#   1. Retrying the step re-issues every contents-API listing. There are 18 of
#      them and the unauthenticated budget is 60/hour, so three attempts of the
#      whole step can spend 54 of it — a retry meant to absorb a blip would
#      itself become a plausible cause of the rate-limit fallback below. Only
#      this script knows which transfers already succeeded, because only it
#      keeps them (`[ -s "$2" ]`).
#   2. The exit status of this step is decided at the bottom of this file, from
#      what is on disk. A step-level retry throws that report away and starts
#      over, so an exhausted retry would say "the step failed three times" where
#      this one says which file, from which URL, after how many attempts.
#
# ⚠️ It absorbs blips and must not hide a dead upstream, so the two are told
# apart by WHAT CAME BACK — the HTTP status, not curl's exit code. An upstream
# that is gone or refusing ANSWERS, and its answers already have a designed path
# here: 404 is the MISS that means an example changed shape upstream, and the
# contents API's 403 is the rate limit whose fallback is the recorded file list.
# Retrying either would spend the backoff to reach the same conclusion three
# times slower.
#
# 🚨 Do NOT re-key this on curl's exit code. That is what this was written as
# first, on the reasonable-sounding rule "exit 22 is an HTTP status, anything
# else is the socket" — and it was wrong: over HTTP/2 this curl reports a 404
# under `-f` as **exit 56** ("failure receiving network data"), which the rule
# read as a blip and retried. Measured, not reasoned about:
#
#     $ curl -fsSL -w '%{http_code}' <a 404 on raw.githubusercontent.com> -o /tmp/x
#     curl: (56) The requested URL returned error: 404
#     404 <- exit=56
#
# The status is what every server actually agrees on, so the status decides.
RETRIES="${RIGC_FETCH_RETRIES:-3}"
RETRY_DELAY="${RIGC_FETCH_RETRY_DELAY:-2}"

retried=0 # retry attempts spent across the whole run, reported at the end
attempts=0 # attempts the last curl_get spent, for the MISS line

# Is this failed transfer worth another attempt? Argument is `%{http_code}`.
#
#   000 / empty  no answer at all — a reset, a timeout, a refused connection
#   2xx          the server answered fine and the transfer broke: truncated
#   408 429 5xx  an answer that means "not now"
#   other 4xx    an answer that means "not here", and will say so again
worth_retrying() { # worth_retrying <http-code>
  case "$1" in
    '' | 000 | 2??| 408 | 429 | 5??) return 0 ;;
    *) return 1 ;;
  esac
}

# One transfer, retried while the failure is worth another attempt. Backoff
# doubles from RETRY_DELAY. Progress goes to stderr so a caller reading this
# function's stdout in a command substitution cannot capture it as data.
curl_get() { # curl_get <url> <path> [extra curl args…]
  local url="$1" path="$2" delay="$RETRY_DELAY" code status
  shift 2
  attempts=0
  while :; do
    attempts=$((attempts + 1))
    status=0
    code="$(curl -fsSL "$@" -w '%{http_code}' "$url" -o "$path")" || status=$?
    if [ "$status" -eq 0 ]; then return 0; fi
    if [ "$attempts" -ge "$RETRIES" ] || ! worth_retrying "$code"; then return "$status"; fi
    echo "    ..   attempt $attempts/$RETRIES failed (curl $status, HTTP ${code:-none}) — retrying in ${delay}s" >&2
    sleep "$delay"
    retried=$((retried + 1))
    delay=$((delay * 2))
  done
}

# Idempotent: an already-downloaded, non-empty file is kept, so this is safe to
# re-run and safe as a pre-task hook (a fresh clone has no examples — they are
# gitignored). Returns non-zero when the file could not be obtained, so a caller
# can count misses instead of the script dying mid-example.
fetch() { # fetch <url> <path>
  if [ -s "$2" ]; then
    echo "    have $(basename "$2")"
    return 0
  fi
  mkdir -p "$(dirname "$2")"
  if curl_get "$1" "$2"; then
    echo "    get  $(basename "$2")"
    return 0
  fi
  rm -f "$2"
  echo "    MISS $(basename "$2")  <- $1  ($attempts attempt(s))"
  return 1
}

# Every `download_url` in one contents-API listing already on disk. `null`
# (directories) does not match the quoted pattern, so it drops out on its own.
# `pipefail` is on, so a grep that matched nothing comes back non-zero — which
# means to the caller exactly what a refused listing does: this listing yielded
# no files.
listing_urls() { # listing_urls <listing-file>
  grep -o '"download_url": *"[^"]*"' "$1" | sed 's/.*"\(https[^"]*\)"$/\1/'
}

missing_license=()
api_fallbacks=()
misses=0

# One directory of one example, by API listing if that works and by the static
# list if it does not.
#
# ⭐ The listing is downloaded HERE rather than inside a `urls="$(list_urls …)"`
# command substitution, because a substitution runs in a subshell and `curl_get`
# keeps two counters — every retry it spent on a listing would be lost, and the
# run would under-report how much blip it absorbed.
fetch_dir() { # fetch_dir <example> <export|images>
  local name="$1" dir="$2" urls file url listing status
  local out="$DEST/$name/$dir"
  listing="$(mktemp "${TMPDIR:-/tmp}/rigc-listing.XXXXXX")"
  status=0
  curl_get "$API/$name/$dir?ref=$REF" "$listing" ${auth[@]+"${auth[@]}"} || status=$?
  urls=''
  if [ "$status" -eq 0 ]; then urls="$(listing_urls "$listing" || true)"; fi
  rm -f "$listing"
  if [ -n "$urls" ]; then
    for url in $urls; do
      file="$(basename "$url")"
      case "$file" in
        *-pma.atlas | *-pma.png | *-pma_*.png) continue ;;
      esac
      case "$dir/$file" in
        export/*.json | export/*.atlas | export/*.png) fetch "$url" "$out/$file" || misses=$((misses + 1)) ;;
        images/*) fetch "$url" "$out/$file" || misses=$((misses + 1)) ;;
      esac
    done
    return 0
  fi
  api_fallbacks+=("$name/$dir")
  echo "    ..   contents API gave no listing for $dir/ (rate limit?) — using the recorded file list"
  local known
  known="$(known_files "$name" "$dir")"
  if [ -z "$known" ]; then
    echo "    WARN no recorded file list for $name/$dir either"
    return 0
  fi
  for file in $known; do
    fetch "$RAW/$name/$dir/$file" "$out/$file" || misses=$((misses + 1))
  done
}

for name in "${EXAMPLES[@]}"; do
  echo "$name"
  out="$DEST/$name"
  mkdir -p "$out"

  # export/ — the reference skeleton data and its atlas.
  fetch_dir "$name" export
  # images/ — the source art the atlas was packed from.
  fetch_dir "$name" images

  # license.txt — the redistribution condition for the images above. Its absence
  # is reported rather than swallowed: it changes what may be done with the art.
  if [ -s "$out/license.txt" ]; then
    echo "    have license.txt"
  elif curl -fsSL -o "$out/license.txt.tmp" "$RAW/$name/license.txt" 2>/dev/null; then
    mv "$out/license.txt.tmp" "$out/license.txt"
    echo "    ok   license.txt"
  else
    rm -f "$out/license.txt.tmp"
    missing_license+=("$name")
    echo "    WARN no license.txt upstream"
  fi
done

# ---------------------------------------------------------------------------
# Verification. Everything above can be a no-op — an empty listing loops zero
# times, a 404 leaves the directory untouched — so the exit status is decided
# here, by what is on disk, and not by whether the loops ran.
# ---------------------------------------------------------------------------
empty=()
for name in "${EXAMPLES[@]}"; do
  count=0
  for f in "$DEST/$name/export"/*.json; do
    if [ -s "$f" ]; then count=$((count + 1)); fi
  done
  if [ "$count" -eq 0 ]; then empty+=("$name"); fi
done

if [ ${#empty[@]} -gt 0 ]; then
  echo
  echo "✗ no skeleton JSON was fetched for: ${empty[*]}"
  echo "  Both the GitHub contents API and the recorded file list failed for these,"
  echo "  after $RETRIES attempt(s) per transfer."
  echo "  The usual cause is the unauthenticated 60/hour rate limit — export a"
  echo "  GITHUB_TOKEN and re-run:  GITHUB_TOKEN=<token> bun run fetch-examples"
  exit 1
fi

echo
echo "examples ready → $DEST"
if [ ${#api_fallbacks[@]} -gt 0 ]; then
  echo
  echo "ℹ️  the contents API did not answer for: ${api_fallbacks[*]}"
  echo "    Those came from the recorded file list instead, which cannot see a"
  echo "    file that was added upstream. Re-run with GITHUB_TOKEN set to confirm."
fi
if [ "$misses" -gt 0 ]; then
  echo
  echo "⚠️  $misses file(s) could not be downloaded (listed as MISS above), each"
  echo "    after $RETRIES attempt(s). Every example still has a skeleton, so this is"
  echo "    not fatal, but the corpus is incomplete — re-run before relying on a"
  echo "    measurement."
fi
# Reported even on a green run: an absorbed blip that leaves no trace is
# indistinguishable from an upstream that never blipped, and the difference is
# the one worth watching. A rising count is an upstream getting worse.
if [ "$retried" -gt 0 ]; then
  echo
  echo "ℹ️  $retried retry attempt(s) were spent on network failures and the run still"
  echo "    completed. That is the blip this retry exists to absorb (issue #335) —"
  echo "    but a count that climbs is upstream degrading, not luck."
fi
if [ ${#missing_license[@]} -gt 0 ]; then
  echo
  echo "⚠️  no license.txt upstream for: ${missing_license[*]}"
  echo "    Treat those images as NOT redistributable — the sibling examples grant"
  echo "    redistribution only when accompanied by their license file, and this one"
  echo "    has no such file to accompany them with. See NOTICE.md."
fi
