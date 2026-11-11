# Instructions for Codex

The authoritative product contract is `SPEC.md`. Review it and all reference images before implementation. This is a build request, not a request for only a plan.

## Non-negotiable rules
1. Implement the complete MVP. Work in small phases and verify each phase; do not stop after writing a plan or wireframe.
2. The home screen has ONE action label `Start` when idle or breaking (not `Start Focus`); `Pause` when focusing; `Resume` when paused. Hide `End Session` in overflow with confirmation.
3. Treat focus, manual pauses, system interruptions, and break overages as distinct sources of time. Never classify page-closed time as manually paused extra time. End tracking at 20:30 local by default.
4. Use accurate event timestamps, interval-based calculations, idempotent transitions, and a testable pure domain/state machine. No second-by-second database rows.
5. Authenticated user data must be isolated by Supabase RLS; never ship or commit secrets. Don't fake cloud persistence or say it works without Supabase configuration.
6. No Correct Break feature, task lists, monthly view, scores/streaks, or multi-device real-time syncing.
7. Aim for a calm, eye-friendly Pomofocus-adjacent look as documented in `reference/DESIGN.md`, not a literal clone, and don't add excess panels. Test mobile/desktop layouts.
8. Keep design references under `reference/` and legacy files under `legacy-stopwatch/`; they are input artifacts, not a mandate to preserve old markup or use the dark iPhone visual style.
9. When finished, run tests and build, include exact commands, describe known limitations, and provide setup/deployment steps, including database SQL/RLS and OAuth redirects.
10. If missing Supabase credentials blocks real authentication, implement and test the app with a **development-only** fixture/data adapter and document that production requires configuration; never expose test mode in a deployed production build.

## Suggested milestones
- Inspect references, decide file organization, implement pure time/state logic plus tests.
- Implement minimal timer screens and lifecycle persistence.
- Implement Supabase migrations, auth, account/avatar, idempotent writes.
- Implement weekly/day/session analytics and data export.
- Run browser tests on responsive layouts, improve polish, document deployment and secure setup.

Do not ask for minor preferences already resolved in `SPEC.md`. Make reasonable low-risk UX defaults. For unresolvable credential issues, finish code and report steps required from user.