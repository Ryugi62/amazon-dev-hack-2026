# SPEC — NextOne (Alexa+ track, Build, Ship, Shape: Amazon Developer Hackathon)
<!-- repo gate keywords: 목적 · 성공 조건 · Given · 비목표 · UI 수용기준 (sections below, in English) -->

## Purpose
NextOne is a day-operating MCP add-on for Alexa+. Ask "what should I do now?" and it answers with one block plus two previews on a single card. Say "I'm 40 minutes late" and it rebuilds the rest of the day with zero overlaps and without moving fixed events. It refuses to record "done" without evidence. State survives across sessions.

Why it is not an existing feature (track "Obvious" list: single-turn Q&A, basic MCP wrapper around an existing API): Alexa reminders and routines fire at fixed times. They neither re-plan after a delay nor ask for proof of completion.

## Ubiquitous language (code names must match)
- Day: one calendar date with Blocks. Block: titled interval [start, end) in minutes since midnight.
- Fixed block: cannot be moved (class, appointment). Flexible block: can be pushed later.
- Status: planned, done, skipped, deferred (did not fit before day end; never counted as done).
- Evidence: {kind, ref}. kind in photo, file, link, third_party (third_party = a sensor, device or receipt reference; this is the only name for it everywhere). self_report is NOT evidence.
- Next-up: first planned Block whose end is after now, plus the next two (preview).
- Running late: the current Block starts later by N minutes; later flexible Blocks are pushed.
- Overlap minutes: sum of minutes covered by two or more Blocks.
- Honest-completion rate: done Blocks that carry valid Evidence / done Blocks.
- Card: {title, fields (max 2), action (exactly 1)}.

## Success conditions (numbers)
1. MCP: real HTTP client completes initialize -> tools/list -> tools/call; tools/list returns >= 6 tools; protocolVersion 2025-11-25 (rules: "implementing MCP spec version 2025-11-25", https://amazonappdev2026.devpost.com/rules section 4; quickstart: "The MCP specification (2025-11-25) deprecated the standalone HTTP+SSE transport", https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html); the card resource (ui://nextone/card-<content hash>.html) is readable as text/html;profile=mcp-app, speaks the MCP Apps bridge (ui/initialize, hostContext, tool-result), and every tool round trip stays under 500 ms (quickstart: "Your MCP server must meet a round-trip query response latency of less than 500 ms", https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html).
2. Re-plan: over 1000 seeded random days x late 5..120 min, overlap minutes after re-plan = 0 in 100% of runs; fixed blocks moved = 0; naive shift-only baseline leaves overlap in >= 20% of the same runs (measured, written to docs/metrics.json).
3. Evidence rule: 100% of 'done' requests without valid Evidence are rejected; honest-completion rate = 100% after any operation sequence (property test, 500 sequences).
4. Persistence: state written by server A is read by a freshly started server B (restart test) with identical next-up result.
5. Card limits: every card from every tool has title 1, fields <= 2, action 1.
6. Host simulator: scripted 5-utterance scenario (what now / late / done without proof / done with proof / what now) passes end-to-end through the real server; free-text input box exists (id=utterance).
7. Doc hygiene: README/docs/host contain no Hangul, no internal-trace tokens (see 10); every number in README equals docs/metrics.json (script exit 0).
8. Test count >= 40, all green, zero dependencies.
9. Throughput limit: `npm run bench` drives real concurrent MCP calls at concurrency 1, 4, 16, 64, 256 against the real server and writes calls per second and p50/p95 per level to docs/metrics.json; it reports the peak calls per second, the first concurrency where p95 is more than 3x the p95 at concurrency 1 (the knee), and the highest tested concurrency whose p95 stays under the 500 ms round-trip limit (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html). Zero errors at every level. README and description quote these generated values.
10. Language and traces: every public file (README, SPEC, docs/*.md, package.json, LICENSE, host/, src/, scripts/) has zero Hangul and zero internal traces (note-system links and paths, absolute home paths, task markers, the author's tooling names; the exact patterns are in scripts/lib/docs-checks.js); tests under test/ hold no Hangul either (test/docs-english.test.js).

## Given / When / Then
- Given a day with blocks A 09:00-10:00 (flexible), B 10:00-11:00 (fixed), C 11:00-12:00 (flexible); When user is 30 min late for A at 09:00; Then A is 09:30-10:30 would overlap B, so A moves after B (11:00-12:00) and C moves to 12:00-13:00; B unchanged; overlap minutes 0.
- Given block A planned; When complete_block(A) with no evidence; Then error "evidence required", A stays planned.
- Given complete_block with kind self_report; Then rejected.
- Given blocks that no longer fit before 24:00 after a re-plan; Then they become deferred, never done.
- Given server restarted; When get_next_up; Then same answer as before restart.

## Non-goals
Real Alexa+ device or account (not used: the rules say "Alternatively, entrants may submit a simulated Alexa+ experience", https://amazonappdev2026.devpost.com/rules section 4; the host here is a simulation and is labelled so everywhere). Real user data (all data synthetic). Auth, payments, model training. Natural-language understanding beyond a small rule-based stand-in for the host LLM.

## Architecture (Clean)
src/domain (pure) <- src/application (use cases, card presenter) <- src/adapters (MCP JSON-RPC) <- src/infrastructure (HTTP server, file store). No reverse imports (test/architecture.test.js enforces).

## UI acceptance criteria
- Contrast >= 4.5:1 in light and dark for all text and buttons (checked with an automated UI audit: 0 failures).
- Touch targets >= 44 px tall; body text 16 px; one font family; no external CSS, JS or fonts.
- Every input has a visible label; the utterance box is reachable and usable by keyboard alone.
- Card: one title, at most two fields, one action; the same layout works at 360 px width without horizontal scroll.
- The simulated-host banner is visible without scrolling on first load.
