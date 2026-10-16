# NextOne - a day-operating MCP add-on for Alexa+

**Try it in 3 minutes, no account needed:** `npm start`, then open http://127.0.0.1:3000 (type your own sentence into the box; the page is a *simulated* Alexa+ host, see below).

Alexa+ track, Build, Ship, Shape: Amazon Developer Hackathon. Zero dependencies, Node 20+.

## What it does
- "What should I do now?" returns **one** block plus **two** previews, on one card.
- "I'm 40 minutes late" rebuilds the rest of the day. No two blocks share a minute, fixed events (a lecture, a dinner) never move, and anything that no longer fits is marked *deferred*, never *done*.
- "I did it" is **not recorded**. Done needs proof: a photo, a file, a link or a `third_party` reference (a sensor, device or receipt id). The server then **checks** the proof: a link must answer HTTP 200, a photo or file must exist in the evidence folder and its size and sha256 are recorded.
- Your real fixed events come in from a standard calendar file (`.ics`), read on your own device; see "Bring your own day" below.
- State survives across sessions (file store; restart test included).

## Evidence: where it comes from and what counts
Where evidence comes from: the Alexa+ host model passes `evidence: {kind, ref}` as an argument of the `complete_block` tool. In the simulated host, `photo X`, `file X`, `link https://...` or `device|sensor|receipt X` in the sentence become the `ref`; whether a real Echo or app would supply it is not tested here.
What the server does with the ref (`src/infrastructure/evidenceVerifier.js`; the rule that a failed check refuses "done" is in `completeBlock`, `src/domain/schedule.js`):

| kind | Check before "done" is recorded | Recorded with the block |
|---|---|---|
| `link` | HTTP HEAD (GET if HEAD is refused) must return status 200 within 400 ms, so the 500 ms round-trip limit (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html) holds | status, check time |
| `photo`, `file` | a non-empty regular file inside the evidence folder (`samples/evidence/` by default, or `NEXTONE_EVIDENCE_DIR`); paths outside it are refused | size in bytes, sha256, check time |
| `third_party` | cannot be opened by this server (a sensor, device or receipt id): accepted as a reference and marked `reference_only` | check time |

If a check fails, times out or the network is down, the block stays planned and the card says "Not confirmed" plus the next step. A valid ref is: `kind` is one of `photo`, `file`, `link`, `third_party` and `ref` is a non-empty string after trimming (`isValidEvidence`); this shape check runs first, so "I did it" with nothing is refused before any I/O. Limits, stated plainly: a 200 answer proves the link exists, not that its content shows the task done; a hash proves which file was shown, not what it depicts.

## Bring your own day: calendar file import
`import_calendar` takes the text of a standard iCalendar (`.ics`) file and makes the timed events of one day the fixed blocks of the plan (default day: the earliest event date in the file). In the simulated host, use the file picker under the chat box: the browser reads the file on your own device and sends only its text to the local server, which keeps the resulting blocks and never the file. Parsing is in `src/adapters/ics.js`; the rule that a double-booked event is dropped and reported is in `fixedBlocksFromEvents` (`src/domain/schedule.js`).
- Handled: `DTEND` or `DURATION`, folded lines, escaped text, daily and weekly repeats (`INTERVAL`, `BYDAY`, `COUNT`, `UNTIL`, `EXDATE`), events that cross midnight (clipped to the day), UTC times (converted to the device's time zone).
- Left out and reported on the card: all-day events, other repeat rules, events with no end time, events that overlap an earlier one (a fixed block cannot move, so two of them on the same minutes would break the zero-overlap rule).
- A time zone name written in the file (`TZID`) is not converted: the wall-clock time in the file is used as is.
- A synthetic sample is in `samples/calendar/sample-day.ics`. Tests use only that file.

## What is different from what Alexa+ already does
See [docs/comparison.md](docs/comparison.md), including a measured row for what a host model does on its own. Short version: Alexa+ reminders can be snoozed and followed up until you say you are done. NextOne re-plans the whole remaining day around fixed events and refuses a spoken "done" without proof.

## The metric (one definition, used everywhere)
**Overlap minutes after a late event** = minutes covered by two or more blocks once the user says "I'm N minutes late" (lower is better). Baseline: the behaviour of a reminder that only moves the late item.

| Measured by `npm run bench` | Value |
|---|---|
| Seeded random days with a late event (counted) | 751 of 1000 generated |
| Runs where NextOne leaves any overlap | 0 |
| Runs where the shift-only baseline leaves overlap | 542 (72.2%) |
| Mean overlap the baseline leaves, over those runs (minutes) | 36.3 |
| Fixed blocks moved by NextOne | 0 |
| Tool round trip, local loopback (p50 / p95 / max, limit 500 ms, from the quickstart: https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html) | 1.7 / 2.5 / 2.7 ms over 200 calls |
| Throughput on one loopback server (real concurrent MCP calls, concurrency 1 / 4 / 16 / 64 / 256, 600 calls per level, 0 errors) | peak 3325 calls per second; p95 more than triples at concurrency 64; p95 stays under the 500 ms limit (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html) up to concurrency 256 |
| Tests | 137 of 137 passing |

The 1000 seeded days are all generated, but `scripts/bench.js` skips every day whose first block is a fixed event (nothing to run late on), so 751 are counted; SPEC.md's 1000 is the generated count, this table is the counted one. These numbers are generated into `docs/metrics.json`; `npm run check-docs` fails if this README disagrees with it.

## Versus the host model alone (measured)
Question a judge would ask: "Would the Alexa+ model re-plan the day by itself, without this add-on?" I cannot call the Alexa+ model, so I measured a stand-in with the same seeded days as the metric above: `scripts/llm-baseline.js` gives a hosted Gemini model the day in plain language, says "I'm N minutes late, re-plan the rest of my day, do not move fixed events" (prompt text: `scripts/llm-replan-prompt.txt`, it also states no overlap, keep lengths, nothing past 24:00), parses the JSON answer and counts it with the same overlap checker NextOne is held to. Run date 2026-10-16, temperature 0, seed 2026. Per-day scores: `docs/llm-baseline/`. Free-tier daily limits are about 20 calls per model, so each model saw a different slice of the seeded list: 112 calls over 112 different days.

| Model | Answers scored | Days with any overlap | Mean overlap on those days (min) | Fixed events moved | Blocks lost | Fully clean answers | Calls not measured |
|---|---|---|---|---|---|---|---|
| gemini-2.5-flash | 15 | 0 (0%) | 0 | 0 in 0 runs | 0 in 0 runs | 15 of 15 | 0 |
| gemini-3-flash-preview | 7 | 0 (0%) | 0 | 0 in 0 runs | 0 in 0 runs | 7 of 7 | 13 |
| gemini-3.1-flash-lite | 0 | 0 (0%) | 0 | 0 in 0 runs | 0 in 0 runs | 0 of 0 | 20 |
| gemini-3.5-flash-lite | 20 | 5 (25%) | 19.6 | 0 in 0 runs | 0 in 0 runs | 15 of 20 | 0 |
| gemini-3.5-flash | 3 | 0 (0%) | 0 | 0 in 0 runs | 0 in 0 runs | 3 of 3 | 7 |
| gemini-3.6-flash | 2 | 0 (0%) | 0 | 0 in 0 runs | 0 in 0 runs | 2 of 2 | 1 |
| gemini-3.7-flash | 3 | 0 (0%) | 0 | 0 in 0 runs | 0 in 0 runs | 3 of 3 | 9 |
| gemini-3.8-flash | 1 | 0 (0%) | 0 | 0 in 0 runs | 0 in 0 runs | 1 of 1 | 11 |
| **All models together** | 51 | 5 (9.8%) | 19.6 | 0 in 0 runs | 0 in 0 runs | 46 of 51 | 61 |
| NextOne on the same scored days | 51 | 0 | 0 | 0 | 0 deferred, none lost | 51 of 51 | 0 |

"Calls not measured" are failed calls (daily limit, server overload, timeout); they are counted separately and left out of every other column. How to read it: on the days that were scored, most of the models re-planned cleanly when the rules were in the prompt, so NextOne does not claim that a model cannot re-plan a day. What the table shows is that a prompt is a request: where a model slipped, the answer still arrived and nothing stopped it, whereas NextOne's server refuses such a plan on every call. Limits: these are Gemini models, not the Alexa+ model; the prompt spells out the rules; the models saw different days, so the pooled row is not a paired comparison; nothing here tests state across sessions or the proof rule for done.

## Required technology and where it is used
| API / SDK | Used for | File |
|---|---|---|
| MCP Streamable HTTP, spec 2025-11-25, named in the rules (https://amazonappdev2026.devpost.com/rules) and the quickstart (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html) (`initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`) | The add-on server Alexa+ connects to | `src/adapters/mcp.js`, `src/infrastructure/server.js` |
| MCP Apps view (`text/html;profile=mcp-app`, `ui/initialize`, `ui/notifications/tool-result`, host context) | The card shown in the conversation | `src/adapters/card.html`, `host/bridge.js` |
| Eight tools: `get_next_up`, `report_running_late`, `complete_block`, `skip_block`, `add_block`, `import_calendar`, `get_today`, `get_rules` | One tool per customer intent | `src/adapters/mcp.js` |

Design rules followed from the Alexa+ MCP design guide: one intent per tool, errors always returned with a next step and no internal ids, one title / at most two fields / one action per card (checked by tests), widget packaged as one self-contained HTML file whose resource URI carries a content hash.

## Simulation, stated plainly
This is a simulated Alexa+ experience, which the rules allow: "Alternatively, entrants may submit a simulated Alexa+ experience instead" (https://amazonappdev2026.devpost.com/rules, section 4). No Alexa+ device or account was used. `host/` is a small stand-in host: a rule-based intent mapper instead of the Alexa+ model, a sandboxed iframe for the card, and the MCP Apps message bridge. The MCP server behind it is real and answers every JSON-RPC call you see in the page's traffic log. Nothing here ran on an Alexa+ device. All bundled data is synthetic; a calendar file you choose to import is read locally and not stored. The host-context device names in the simulator (`echo-show-8`, `echo-show-15`) are guesses: the docs I read do not list the real values (see the friction log).

## Run and test
```
npm start        # server + simulated host on http://127.0.0.1:3000
npm test         # unit, property, integration and scenario tests
npm run bench    # regenerate docs/metrics.json
npm run check-docs
```

## Architecture
`src/domain` (pure rules) <- `src/application` (use cases, card presenter) <- `src/adapters` (MCP JSON-RPC) <- `src/infrastructure` (HTTP, file store). A test fails the build if a layer imports upward. See [SPEC.md](SPEC.md).

## Feedback for the platform teams
Real friction met while building: [docs/friction-log.md](docs/friction-log.md).

## License
MIT, see LICENSE.
