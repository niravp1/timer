# Focus Tracker — Codex implementation handoff

**Status:** Specification and implementation references are committed. The new application is **not yet built**.

This repository is intended for an OpenAI Codex coding task. The product is a calm, Pomofocus-adjacent personal focus and break tracker, not a conventional Pomodoro task manager.

## Start the build in Codex

1. Open **https://chatgpt.com/codex** and select a GitHub-connected **cloud** coding task.
2. Select repository **`niravp1/timer`**, branch **`main`**. If the repository doesn't appear, configure Codex's GitHub access to include it.
3. Copy the task instructions in **[`CODEX_PROMPT.md`](CODEX_PROMPT.md)** into the prompt and submit.
4. Let Codex implement, run tests, and propose changes. Review its diff/PR before merging.
5. After the code is ready, follow Codex's Supabase Google OAuth/database setup and deployment instructions. **Never commit environment secrets**.

## Product specifications

- [`SPEC.md`](SPEC.md) — authoritative MVP behavior, data schema, edge cases, metrics, and UI requirements.
- [`AGENTS.md`](AGENTS.md) — repository-wide Codex instructions and constraints.
- [`TEST_SCENARIOS.md`](TEST_SCENARIOS.md) — acceptance test examples.
- [`reference/DESIGN.md`](reference/DESIGN.md) — textual UI design reference; original screenshot images are available in the separate chat ZIP.
- [`legacy-stopwatch/`](legacy-stopwatch/) — old standalone stopwatch prototype, for reference only.

## Intended UX

- A single large 60-minute (configurable) focus countdown with **Start**, **Pause**, and **Resume**.
- When focus completes, an upward-counting break stopwatch starts automatically. Break overage begins after a configurable 15-minute allowance.
- Starting focus from a break logs the break automatically.
- Hidden **End Session** ends tracking without an accidental extra-long break.
- After the configurable **8:30 PM** cutoff, all tracking stops for the local day.
- Focus pauses when the page closes or reloads; time away is separately tracked instead of counted as manual-pause extra time. Break stopwatch keeps wall-clock time until cutoff or manual closure.
- Minimal **Metrics** tab with Week → Day → Session detail, and richer raw event logs under the hood.
- User-specific private cloud storage via Supabase, with no cross-device live synchronization in MVP.

## Important notes

- Nothing here is deployed, and no Supabase or OAuth credentials are configured yet.
- A Google account, cloud database project, or Vercel setup may require manual authorization.
- The repository may be public; never commit confidential data, private API keys, or service-role keys.
