# NextOne - a day-operating MCP add-on for Alexa+

**Try it in 3 minutes, no account needed:** `npm start`, then open http://127.0.0.1:3000 (type your own sentence into the box; the page is a *simulated* Alexa+ host, see below).

Alexa+ track, Build, Ship, Shape: Amazon Developer Hackathon. Zero dependencies, Node 20+.

## What it does
- "What should I do now?" returns **one** block plus **two** previews, on one card.
- "I'm 40 minutes late" rebuilds the rest of the day. No two blocks share a minute, fixed events (a lecture, a dinner) never move, and anything that no longer fits is marked *deferred*, never *done*.
- "I did it" is **not recorded**. Done needs proof: a photo, a file, a link or a device signal.
- State survives across sessions (file store; restart test included).

## What is different from what Alexa+ already does
See [docs/comparison.md](docs/comparison.md). Short version: Alexa+ reminders can be snoozed and followed up until you say you are done. NextOne re-plans the whole remaining day around fixed events and refuses a spoken "done" without proof.

## The metric (one definition, used everywhere)
**Overlap minutes after a late event** = minutes covered by two or more blocks once the user says "I'm N minutes late" (lower is better). Baseline: the behaviour of a reminder that only moves the late item.

| Measured by `npm run bench` | Value |
|---|---|
| Seeded random days with a late event (counted) | {{replan.runs}} of 1000 generated |
| Runs where NextOne leaves any overlap | {{replan.nextone_overlap_runs}} |
| Runs where the shift-only baseline leaves overlap | {{replan.baseline_overlap_runs}} ({{replan.baseline_overlap_percent}}%) |
| Fixed blocks moved by NextOne | {{replan.fixed_blocks_moved}} |
| Tool round trip, local loopback (p50 / p95 / max, limit {{latency.limit_ms}} ms, from the quickstart: https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html) | {{latency.p50_ms}} / {{latency.p95_ms}} / {{latency.max_ms}} ms over {{latency.calls}} calls |
| Tests | {{tests.passed}} of {{tests.tests}} passing |

The 1000 seeded days are all generated, but `scripts/bench.js` skips every day whose first block is a fixed event (nothing to run late on), so {{replan.runs}} are counted; SPEC.md's 1000 is the generated count, this table is the counted one. These numbers are generated into `docs/metrics.json`; `npm run check-docs` fails if this README disagrees with it.

## Required technology and where it is used
| API / SDK | Used for | File |
|---|---|---|
| MCP Streamable HTTP, spec 2025-11-25, named in the rules (https://amazonappdev2026.devpost.com/rules) and the quickstart (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html) (`initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`) | The add-on server Alexa+ connects to | `src/adapters/mcp.js`, `src/infrastructure/server.js` |
| MCP Apps view (`text/html;profile=mcp-app`, `ui/initialize`, `ui/notifications/tool-result`, host context) | The card shown in the conversation | `src/adapters/card.html`, `host/bridge.js` |
| Seven tools: `get_next_up`, `report_running_late`, `complete_block`, `skip_block`, `add_block`, `get_today`, `get_rules` | One tool per customer intent | `src/adapters/mcp.js` |

Design rules followed from the Alexa+ MCP design guide: one intent per tool, errors always returned with a next step and no internal ids, one title / at most two fields / one action per card (checked by tests), widget packaged as one self-contained HTML file whose resource URI carries a content hash.

## Simulation, stated plainly
This is a simulated Alexa+ experience, which the rules allow: "Alternatively, entrants may submit a simulated Alexa+ experience instead" (https://amazonappdev2026.devpost.com/rules, section 4). No Alexa+ device or account was used. `host/` is a small stand-in host: a rule-based intent mapper instead of the Alexa+ model, a sandboxed iframe for the card, and the MCP Apps message bridge. The MCP server behind it is real and answers every JSON-RPC call you see in the page's traffic log. Nothing here ran on an Alexa+ device. All data is synthetic. The host-context device names in the simulator (`echo-show-8`, `echo-show-15`) are guesses: the docs I read do not list the real values (see the friction log).

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
