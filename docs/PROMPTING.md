# Prompting an AI to author with rigc

This page is for the person **operating** an AI agent — any AI agent — that will
author a rig with rigc. It is not authoring guidance; that is
[AUTHORING.md](AUTHORING.md), and the agent should read that file, not this one.
This page tells you what to put in the prompt, and it earns its claims from a
measured case: in August 2026 a deliberately small model — Gemini 3.7 Flash on
the Antigravity harness — authored a benchmark rung unattended for three hours,
and every stumble below is one it actually made, priced by the instruments in
[PILOT.md](https://github.com/firejune/rigc/blob/main/docs/PILOT.md)'s protocol. A large model makes fewer of these mistakes
unprompted; the clauses cost you three lines and make the small model's run
land and the large model's run land cleaner.

## The prompt skeleton

For ordinary use (not a benchmark), the whole prompt is short:

> Author a Spine rig with rigc for <what you want>. The images are in
> `<dir>`. Read `docs/AUTHORING.md` in full before writing either spec —
> sections 1–5 are the two file formats and the failure map, section 8 is how
> to fit poses against picture references, section 10 is the editor's
> conventions. Build with `rigc build`, keep going until `rigc validate` is
> green, and treat every named failure as pointing at the file to change.

Then add the clauses below. If you are running the **benchmark**, do not
improvise a prompt at all — hand the agent
[pilot/rung3-runner-prompt.md](https://github.com/firejune/rigc/blob/main/docs/pilot/rung3-runner-prompt.md) verbatim; it
carries the honesty rule, and an improvised summary of that rule is how a run
stops being scorable.

## Five clauses the pilot paid for

**1. Any search loop must print progress and carry a time-box.**
The pilot wrote a pose-fitting script with no output and no bound, and its
operator spent part of the evening deciding whether a silent 99 %-CPU process
was working or hung. (It was working — but nobody could tell.) Say:

> Long-running scripts must print one progress line per unit of work and state
> an expected total up front. If a search would exceed ten minutes, stop and
> narrow it instead.

**2. Intermediate results go to files, not scrollback.**
The pilot's first fitters printed results to stdout; a crashed step would have
lost the lot. It later switched to JSON files on its own — start there. Say:

> Write measured values (placements, angles, fitted poses) to files in the
> working directory as you go. Treat your transcript as disposable.

**3. Point the fitting method at AUTHORING §8, by number.**
Given frames to match, the pilot's first instinct was a nested grid over every
knob at once — tens of thousands of renders per frame. §8 describes the cheap
loop (one knob at a time, render back, keep what the measurement keeps). The
pilot had the file "in hand" and did not apply the section until it had burned
hours. Say:

> Fit poses the way AUTHORING §8 does — one variable at a time against a
> render-back measurement. Do not grid-search several knobs jointly.

**4. Keys are structure, not samples.**
A fitter produces one pose per frame, and the pilot keyed nearly every one of
them. The result *placed* its parts well — and still scored poorly on every
timing measure, because animation data is sparse keys plus interpolation
(AUTHORING §10.3–§10.4), and a key on every frame is a pixel transcription
wearing a skeleton. Say:

> Key extremes and contacts, then let curves carry the in-betweens, per
> AUTHORING §10.3–10.4. If your fitted poses disagree with a curve, move the
> curve, not key count. Also §4.4: when a bone's two axes need different
> timing or easing, key the single-axis timelines, not the paired one.

**5. Keep the loop log live.**
The pilot wrote its `LOOP.md` at the end, from memory — two entries for a
three-hour session, with eight generations of fitting scripts invisible
between them. A log written afterwards records the story, not the work. Say:

> Append to `LOOP.md` at the moment each build/measure/change step happens,
> not at the end. One line per step is enough.

**6. Make the agent typecheck its own helper scripts.**
Bun strips types and runs, so an agent can call methods that do not exist and
watch the script fail — or worse, silently misbehave — without ever learning
the API was imagined. The pilot left behind a helper written against
spine-core methods that were never real; the repository's `typecheck` gate
caught it at landing, hours too late to help the run. Say:

> After writing any helper script, run `bunx tsc --noEmit <file>` (or the
> project's `typecheck` task) before trusting its output.

## What you do not need to say

The same pilot, unprompted, did all of this correctly: it looped
`build → validate` until green and read the named failures as pointers; it ran
the whole thing without a human answer for three hours; it killed its own
stray processes; it recorded its model name honestly; and under the benchmark
protocol it ran the scored diff exactly once, at the end, editing nothing
after. The tool's own error surface carries that part of the conversation —
prompt for the five clauses above and then let the agent work.

## If you are scoring the run

That is a different document: [PILOT.md](https://github.com/firejune/rigc/blob/main/docs/PILOT.md) is the protocol,
`pilot/rung3-runner-prompt.md` is the exact prompt, and the evaluator sheet it
names is for the judge only. The one rule that reaches this page: **never put
baseline figures, reference structure, or previous runs' measures into the
runner's prompt** — a number in the prompt is a target, and a run that aimed
at a target measured nothing.
