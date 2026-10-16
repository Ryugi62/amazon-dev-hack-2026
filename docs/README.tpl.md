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
See [docs/comparison.md](docs/comparison.md). Short version: Alexa+ reminders can be snoozed and followed up until you say you are done. NextOne re-plans the whole remaining day around fixed events and refuses a spoken "done" without proof.

## The metric (one definition, used everywhere)
**Overlap minutes after a late event** = minutes covered by two or more blocks once the user says "I'm N minutes late" (lower is better). Baseline: the behaviour of a reminder that only moves the late item.

| Measured by `npm run bench` | Value |
|---|---|
| Seeded random days with a late event (counted) | {{replan.runs}} of 1000 generated |
| Runs where NextOne leaves any overlap | {{replan.nextone_overlap_runs}} |
| Runs where the shift-only baseline leaves overlap | {{replan.baseline_overlap_runs}} ({{replan.baseline_overlap_percent}}%) |
| Mean overlap the baseline leaves, over those runs (minutes) | {{replan.baseline_mean_overlap_minutes}} |
| Fixed blocks moved by NextOne | {{replan.fixed_blocks_moved}} |
| Tool round trip, local loopback (p50 / p95 / max, limit {{latency.limit_ms}} ms, from the quickstart: https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html) | {{latency.p50_ms}} / {{latency.p95_ms}} / {{latency.max_ms}} ms over {{latency.calls}} calls |
| Throughput on one loopback server (real concurrent MCP calls, concurrency 1 / 4 / 16 / 64 / 256, {{throughput.levels.0.calls}} calls per level, 0 errors) | peak {{throughput.peak_calls_per_second}} calls per second; p95 more than triples at concurrency {{throughput.knee_concurrency}}; p95 stays under the {{throughput.limit_ms}} ms limit (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html) up to concurrency {{throughput.max_concurrency_under_limit}} |
| Tests | {{tests.passed}} of {{tests.tests}} passing |

The 1000 seeded days are all generated, but `scripts/bench.js` skips every day whose first block is a fixed event (nothing to run late on), so {{replan.runs}} are counted; SPEC.md's 1000 is the generated count, this table is the counted one. These numbers are generated into `docs/metrics.json`; `npm run check-docs` fails if this README disagrees with it.

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
