# What NextOne does that existing options do not

Checked 2026-10-16. "Verified" means I read the page text; "reported" means a third-party review.

| Existing option | What it does for a running-late day | What it does not do | Source |
|---|---|---|---|
| Alexa+ reminders and task list (Amazon) | One task list for reminders and to-dos. Snooze: "Snooze reminder for 20 minutes", "Remind me again in an hour". Verified. | Snooze moves that one reminder. Nothing re-plans the other items or protects fixed events from overlap. | https://digprjsurvey.amazon.com/csad/help/node/T30e4eImkYHXKiYbvr |
| Alexa+ follow-up reminders (Amazon) | "Alexa sends you reminder notifications every hour or day until you confirm that you've completed the task." Verified. | The confirmation is the user's word. A spoken "done" always counts. NextOne does not record done without a photo, file, link or third_party signal. | same page |
| Alexa reminders set by voice or app (Amazon) | Time and recurrence based reminders, assignable to a household member. Verified. | Fire at a set time; no day-level plan, no "what is next" answer with previews. | https://digprjsurvey.amazon.com/csad/help/node/GDDXYWQUKGGWG79Y |
| Host LLM default capability (Alexa+ model that calls the add-on) | Unknown. I found no page that says whether the host model re-plans a day around fixed events or asks for proof before it marks something done. | Not assessed; NextOne does not depend on the host doing either, because the server enforces both. | unknown (no source) |
| Motion (calendar and task planner) | Reported to reschedule the rest of the day automatically when you fall behind, shifting lower-priority work. Reported, not verified by me. | Not an Alexa+ add-on; reported pricing from $19 per month; no proof requirement for done. | https://www.morgen.so/blog-posts/motion-review |

**What only NextOne has:** inside the Alexa+ conversation, a re-plan with a proof you can check (0 overlapping minutes, fixed events untouched) and a done that needs evidence. The numbers behind that line are in `docs/metrics.json`.

**Honest limit:** snooze plus follow-up already covers a late single task. NextOne's claim is the whole-day re-plan and the evidence rule, not lateness handling in general.
