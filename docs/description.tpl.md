# NextOne: when your day slips, Alexa+ re-plans all of it and will not take "done" on your word

**Try it with no account, in 3 minutes:** repository https://github.com/Ryugi62/amazon-dev-hack-2026, then `npm start` and open http://127.0.0.1:3000 (type your own sentence; the page is a *simulated* Alexa+ host, stated on screen).

**Who it is for.** About 15.4 million US undergraduates (NCES, fall 2021: https://nces.ed.gov/fastfacts/display.asp?id=98) live on a day made of fixed events (lectures, shifts, dinners) and flexible work around them. Alexa+ is in the same hands: Amazon confirmed more than one million Alexa+ users on 2025-06-23 (https://techcrunch.com/2025/06/23/over-a-million-people-now-have-access-to-the-gen-ai-powered-alexa). **The problem:** when one thing runs late, a reminder moves that one item and leaves the rest of the day double-booked; in our seeded simulation that happens on 72.2% of late days. **The fix:** NextOne is an MCP add-on that answers "what should I do now?" with one block plus two previews on a single card, rebuilds the rest of the day when you say "I'm 40 minutes late" (0 overlapping minutes, fixed events never move), and refuses to record "done" without proof. **After the hackathon:** the same MIT-licensed server is what you register as an Alexa+ add-on once the add-on console admits you; until then it runs self-hosted with `npm start`.

**What only NextOne has (one line):** a whole-day re-plan with an invariant you can check (0 overlapping minutes, 0 fixed blocks moved) *plus* a completion rule that needs evidence, inside the Alexa+ conversation.

### Versus what Alexa+ already does, and what the host model may already do
I checked each on 2026-10-16.

| Existing option | What it does | What NextOne adds | Source |
|---|---|---|---|
| Alexa+ reminders and task list (Amazon) | Snooze: "Snooze reminder for 20 minutes" | Snooze moves one reminder; NextOne re-plans every later block around fixed events | https://www.amazon.com/gp/help/customer/display.html?nodeId=T30e4eImkYHXKiYbvr |
| Alexa+ follow-up reminders (Amazon) | "Alexa sends you reminder notifications every hour or day until you confirm that you've completed the task." | The confirmation is your word; NextOne does not record done without a photo, file, link or third_party reference | same page |
| Alexa+ calendar and summaries (Amazon) | "meaningful summaries of your day, helps you schedule events when everyone is free" | That page describes no re-plan after a delay; NextOne answers "what is next" with previews and re-plans on "I'm late" | https://www.aboutamazon.com/news/devices/new-alexa-plus-amazon-devices |
| Motion (third-party review) | Reported to reschedule the day automatically when you fall behind | Not an Alexa+ add-on; no proof requirement for done | https://www.morgen.so/blog-posts/motion-review |
| Host LLM default capability | Unknown: I found no page saying the Alexa+ model re-plans a day or asks for proof | The server enforces both, so it does not depend on the host model | none (no source found) |

## Simulation, stated first
This is a simulated Alexa+ experience, which the rules allow: "Alternatively, entrants may submit a simulated Alexa+ experience instead" (https://amazonappdev2026.devpost.com/rules, section 4). No Alexa+ device or account was used. The MCP server is real (Streamable HTTP, spec 2025-11-25); the host that talks to it is a small stand-in with a rule-based intent mapper instead of the Alexa+ model. All data is synthetic. Limit: nothing here ran on an Alexa+ device, and the Alexa+ Local Inspector needs a developer-console login I do not have (friction log entry 4).

## Technical Implementation
- Self-hosted MCP server, zero dependencies, Node 20+: `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read` over Streamable HTTP, protocol version 2025-11-25. Seven tools, one per customer intent: `get_next_up`, `report_running_late`, `complete_block`, `skip_block`, `add_block`, `get_today`, `get_rules`.
- MCP Apps card (`text/html;profile=mcp-app`, `ui/initialize`, tool-result notification), packaged as one self-contained HTML file whose resource URI carries a content hash.
- Clean layers (domain, application, adapters, infrastructure); a test fails the build on an upward import. State is a file store; a restart test proves a fresh server gives the same next-up answer.
- Round trip on local loopback: {{latency.p50_ms}} ms p50 and {{latency.p95_ms}} ms p95 over {{latency.calls}} calls, against the 500 ms limit in the quickstart (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html). {{tests.tests}} tests, all passing.
- Throughput limit, measured with real concurrent MCP calls (half reads, half state-changing writes, fresh server per level): peak {{throughput.peak_calls_per_second}} calls per second; p95 more than triples at concurrency {{throughput.knee_concurrency}}; p95 stays under the 500 ms limit up to concurrency {{throughput.max_concurrency_under_limit}} (the highest level tested), on one developer laptop over loopback. This is a single-process file-store design, not a claim about production scale.
- Every number in the README and here is generated into `docs/metrics.json` by `npm run bench`; `npm run check-docs` fails when a document disagrees.

**The metric (one definition, used everywhere).** **Overlap minutes after a late event** = minutes covered by two or more blocks once the user says "I'm N minutes late" (lower is better). Baseline: the behaviour of a reminder that only moves the late item.

| Measured by `npm run bench` (seeded, 1000 days generated) | Value |
|---|---|
| Days counted (first block is flexible, so it can run late) | 751 |
| Days where NextOne leaves any overlap | 0 |
| Days where the shift-only baseline leaves overlap | 542 (72.2%) |
| Mean overlap the baseline leaves on those days | 36.3 minutes |
| Fixed blocks moved by NextOne | 0 |

## Design
- One title, at most two fields, one action per card, the rule in the Alexa+ design guide: "Show only the information the customer needs to make the next decision. One title, one or two supporting fields, one clear action." A test validates every card of the scripted five-turn scenario against it.
- Errors always carry the next step and no internal ids. A failed "done" says what is needed ("Needs a photo, file, link or third_party signal") and offers one action, "Add proof".
- First screen to the core result in two steps: ask "what should I do now?", read one block and two previews. The simulated-host banner is visible without scrolling.
- Screenshots, in gallery order (all from the running simulation, banner visible):

| Image | Shows | Card fields (title / fields / action) |
|---|---|---|
| 1 `1-next-one-plus-two.png` | "what should I do now?" gives Morning study 08:30-09:30, then Data Structures lecture and Lunch | 1 / 2 / 1 |
| 2 `2-replan-40-min-late.png` | "I'm 40 minutes late": 2 blocks moved, 0 overlaps | 1 / 2 / 1 |
| 3 `3-done-refused-no-evidence.png` | "I did it" with no proof: Not recorded, needs a photo, file, link or third_party signal | 1 / 1 / 1 |

## Potential Impact
- **Dollar estimate of the part NextOne changes (not a market forecast).** Per late day, a shift-only reminder leaves overlap on 72.2% of days, averaging 36.3 minutes when it does: 0.722 x 36.3 = 26.2 minutes of double-booked time per late day. Valued at the US federal minimum wage of $7.25 per hour (https://www.dol.gov/general/topic/wages/minimumwage), as a deliberately low floor: 26.2 / 60 x 7.25 = $3.17 per late day. With an assumed 50 late days a year (one a week; an assumption I have not measured), that is $158 per user per year.
- **Price and model.** Free for the customer: the add-on is MIT-licensed and self-hostable. Hypothesis, not validated: a paid tier at $2.99 per user per month (billing unit: user-month) for syncing an external calendar. Anchor: a reported price of $19 per month for Motion (https://www.morgen.so/blog-posts/motion-review, third-party, not verified by me).
- **Not measured yet:** real-user results. No participant outside my circle has used it, so there is no before/after number from users; the roadmap below measures that first.

| Date | Milestone | Resources | Target |
|---|---|---|---|
| 2026-10-23 | Submission closes (12:00 pm Pacific) | 1 developer, $0 infrastructure | {{tests.tests}} tests passing, 0 overlap on 751 counted days |
| 2026-11-30 | Read-only calendar import so a real fixed-event list can seed the day | 1 developer, $0 | At least 1 import adapter, fixed blocks moved stays 0 |
| 2027-01-31 | Measure with users outside my circle | 1 developer, $0 | At least 10 users, overlap minutes before vs after reported with raw data |

## Quality of the Idea
- **Versus the track's "Obvious" list.** The Alexa+ track lists "single-turn Q&A bot, basic MCP wrapper around an existing API" as obvious. NextOne is neither: it is a stateful, multi-turn add-on whose server enforces rules. It matches the track's "Creative" example "context-aware add-on that maintains state across sessions" and uses "MCP Apps" and cards from the same list.
- **Honest limit.** Snooze plus follow-up already covers a late single task. Other entries in this hackathon also gate state changes on evidence. NextOne's claim is narrower: the whole-day re-plan with a checkable invariant, together with the evidence rule.

## Friction log and feedback
Seven entries with dates, repro steps and suggestions, plus the five product-feedback answers per tool: `docs/friction-log.md`.
