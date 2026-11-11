# Minimal Focus & Break Tracker — MVP Product + Engineering Specification

Version: 1.0 | Date: 2026-11-10 | Status: approved requirements for implementation

## 0. Objective

Build an intentionally minimal, production-quality, responsive personal Pomodoro web app. Inspired by the simple composition and large timer of the **Pomofocus-inspired layout** described in `reference/DESIGN.md`, but visually calmer and more polished. The UI should ask for almost no ongoing interaction: press **Start** to work; the 60-minute countdown leads automatically into an upward-counting break; pressing **Start** during the break saves it and starts another focus session. Pauses, breaks, extra time, and accurate timestamps are logged automatically. A hidden **End Session** action is available when leaving for hours. An 8:30 PM local cutoff ends tracking every day.

**North star:** One primary action. One large timer. Three quiet screens (Focus, Metrics, Settings/Profile). Detailed event data under the hood, minimal metrics on the surface.

## 1. Scope — definitive

### Must have
- React + TypeScript web app, desktop and mobile responsive, publicly hostable as a static frontend.
- Supabase Auth (Google sign-in) and private per-user PostgreSQL persistence via Supabase with RLS; optional small avatar upload.
- Configurable **focus target** (default **60 minutes**), **included break allowance** (default **15 minutes**), and **daily cutoff** (default **8:30 PM / 20:30** in the user's configured IANA time zone).
- Four top-level timer states: `idle`, `focus_running`, `focus_paused`, `break_running`. Within focus pauses, distinguish `manual` from `system`/away interruptions.
- Primary button label is exactly **Start** (never “Start Focus”). Paused focus primary action is **Resume**. Running focus has **Pause**. During break, primary is **Start** (this closes/logs the break and immediately starts the next focus).
- Focus ends only when accumulated **active focus time** reaches the selected target; pauses do not reduce the remaining countdown.
- Focus completion automatically begins an unlimited **upward-counting break stopwatch**, with no separate Start Break action.
- Break stopwatch starts at 00:00, displays total elapsed break. First 15 minutes (or current per-break allowance) are included; after that show a restrained `+MM:SS extra` indicator. Do not hide the primary elapsed break clock.
- Overflow menu (`…`) contains **End Session**, which asks for simple confirmation. From focus, save any partial focus and end early; from break, end/log the break. Return to idle. No standalone Correct Break feature, no retroactive break editing.
- Daily automatic shutdown at configured **20:30 local time**: ends and logs currently running/paused focus or active break with exact cutoff as end timestamp, stops all counting, and prevents further Start until the next local date. It must also reconcile properly when the browser was closed at cutoff.
- Focus **automatically pauses when the page is actually closed, navigated away from, or reloaded**, not when merely switching browser tabs. On return, remain paused until user explicitly clicks **Resume**. Closed-page time is logged as `system_interruption` and **does not count as manual pause extra time**. Explain unavoidable crash/timing limits honestly in implementation notes.
- While **break is active**, closing the page does NOT pause the stopwatch. Break keeps accruing from elapsed wall-clock time until next Start, End Session, or the daily cutoff, whichever occurs first. On reopening, reconstruct accurately from timestamps.
- Detailed structured activity records (sessions, active focus intervals, manual pauses, system interruptions, breaks, discrete events, start/end timestamps, configured targets, completion status, end reason).
- Metrics: Week (default), Day (select day), Session/Cycle (select entry). Main metrics only **Focused**, **Break time**, **Extra time**. Extra time drilldown: manual focus pauses vs breaks beyond allowance. Number of breaks may appear as secondary context in day activity but NOT as a headline KPI.
- Weekly view: Monday–Sunday, prior/next week navigation, exactly one simple seven-day bar chart of extra time; clicking day reveals daily view. No month view.
- Day: minimal three totals, breakdown of extra time, chronological Pomodoro cycles/entries; session and break timestamps; navigate to detail.
- Session: explicit original start–end wall-clock span, effective focus, manual pause, automatic interruption (separate), completion status; an optional lightweight proportional timeline; break start/end, full break elapsed, included and extra.
- Export all user activity as JSON in Settings for backup; session history is not editable in MVP.
- Persist app state safely through refresh and browser close, with event idempotency and recovery. Keep business logic separated from UI.
- Test core timer calculations, cutoff, lifecycle, data security and rendering.

### Deliberately NOT in MVP
- Task lists, labels, goals, streaks, productivity scores, achievements, monthly reports, audio/music features, push notifications, social features, team accounts.
- A separate “Start Break” / “End Break” main control. Breaks are automatically managed.
- Correct Break, manual historical editing, arbitrary deleting of individual laps, or automated “smart timeout” other than the configured daily cutoff.
- Complex cross-device real-time syncing, remote device arbitration, and offline-first collaborative operation. Account data is persisted in the cloud, but concurrent multi-device use is out of scope. Document that limitation.
- Arbitrary all-day work scheduler. No “start my day” action beyond Start; no “finish for the day” separate from End Session or 20:30 cutoff.
- A full mechanical clone of Pomofocus or the old iPhone stopwatch. Reference files are visual/logic inspiration only.

## 2. Main screen / interaction requirements

### 2.1 Layout
A quiet page with a compact top bar: product name left, `Metrics` and avatar/settings right. Center a softly elevated timer panel (~480–560 px max width). Inside: small state label, **oversized 60:00 or stopwatch digits**, at most one status line, one primary button. Small `…` menu near panel. No live stats on the Focus screen. Desktop ample whitespace; mobile layout full-width and tap-friendly. No task area below timer.

**Idle**: `FOCUS` / `60:00` / `[ Start ]`. Show cutoff-day message and disable button if local time >= cutoff.

**Running focus**: `FOCUS` / `42:31` / `[ Pause ]`. Could show restrained progress indicator. No headline metrics.

**Manual pause**: `PAUSED` / `42:31` / `[ Resume ]`. Save exact pause start/end and include accumulated pause time in extra metrics.

**System pause after page closed/reloaded**: `PAUSED WHILE AWAY` / remaining time / `[ Resume ]`. Off-page interval is *not* extra time.

**Active break**: `BREAK` / `23:42` (stopwatch UP) / `+08:42 extra` (only shown after included allowance) / `[ Start ]`. `… → End Session` available.

**After cutoff**: `FINISHED FOR TODAY` / idle-state panel / `Start` disabled until following local day. No surprise automatic new sessions.

### 2.2 Start / Focus / Pause / Resume
- First Start from idle begins a new *work block* and focus session with a UTC start timestamp and snapshot of current target duration.
- Start during break performs one logically atomic transition: finalize current break at event timestamp, calculate associated break overage, then create next focus in same work block at identical timestamp.
- Every pause/resume boundary creates a precise interval. A 60-minute target can be achieved in arbitrary chips: e.g. 5m focus, 10m pause, 5m focus, 5m pause, 50m focus. Total focus 60m; manual extra 15m; 75m wall-clock session, assuming no other interruptions.
- When remaining active focus reaches zero while page remains open, record exact completion moment (not delayed setInterval callback moment) and start break at that moment.
- Pause while background tab remains open still works. Tab visibility change alone does not imply page closure or system pause.

### 2.3 Page lifecycle / browser close
- `pagehide`/navigation/reload: close current active (or manually paused) interval at the best available observed timestamp, open a `system_interruption`, and persist paused state. On reload, show paused, preserving remaining time and session's original start.
- In an abnormal crash where no close event fires, recover conservatively from last saved healthy checkpoint/heartbeat. Explicitly mark recovery precision (`observed` vs `inferred`) and never charge uncertain closed-page time as focused or manual extra. Avoid claiming exact crash timestamp.
- A **break**, unlike focus, is based on persisted wall-clock `break_started_at`; closing the browser doesn't stop it. On reopen recompute exact elapsed duration, bounded by cutoff.
- If focus was manually paused and the user closes the page, the manual pause ends at closure/checkpoint. Subsequent closed-page span is system interruption, not manual extra.

### 2.4 End Session (manual kill switch)
- Entry is in `…` menu, not a large accidental-tap button.
- Confirmation: `End session? Your progress will be saved, and tracking will stop.` Cancel / End Session.
- Running or paused focus: close any open interval and focus with status `ended_early`, preserving active focus. Do not generate a break.
- Running break: close/log break, preserving total duration and extra time.
- Close current work block, set idle. The time after End Session and before the next Start is **untracked** (not a break or extra time). Optional generic `idle` gap in logs can be derived later from block boundaries; no need to create continuous idle events.
- Next Start begins a new block and a fresh configured focus timer. Previous partial focus remains counted in daily active-focus totals but is not rolled into the new 60-minute countdown.

### 2.5 Automatic cutoff
- Settings stores `daily_cutoff_local='20:30'`, `time_zone='America/New_York'` initially derived from user/browser unless chosen otherwise.
- At exactly that local cutoff, **end** any focus/break, set idle/locked for remainder of local day, and store `end_reason='daily_cutoff'`.
- If focus hasn't reached target, mark `ended_early`, credit only actual active focus. If paused, finish paused interval at cutoff (manual pause only through cutoff, system pause excluded). If on break, cap break duration at cutoff.
- If browser closed during break, realize cutoff retroactively on the next visit using the cutoff UTC instant; never count after cutoff, regardless of reconnection timestamp. If browser closed during focus, it was already system-paused; at cutoff, finish that incomplete focus, excluding the closed-page span.
- At cutoff, do not enter a new break even if focus would otherwise complete at that precise instant; **cutoff wins ties**.
- While after cutoff, Start disabled until next local date, even after End Session. Next day is idle; no autostart.
- Configurable in Settings; snapshot prior cutoff policy on affected records as appropriate. Avoid rewriting history after setting changes.

## 3. Metrics / reporting

### 3.1 Definitions
Store integer millisecond or second durations in calculations. Display in friendly h/m format. Never round source timestamps or sum already rounded values.

Per focus session:
- `focus_active = sum(focus intervals)`; this is what counts toward target and 'Focused' metrics.
- `manual_pause = sum(manual_pause intervals)`; this contributes to **extra time**.
- `system_interruption = sum(system_interruption intervals)`; this is tracked and visible in session detail, **excluded** from 'extra time'.
- `wall_clock_span = ended_at - started_at`; not equal to active focus.

Per break:
- `break_elapsed = break_ended_at - break_started_at` (clamped to cutoff if needed).
- `break_extra = max(0, break_elapsed - allowance_snapshot)`.
- No carryover credit: a 12-minute break doesn't offset a 23-minute break's 8-minute overage.

For a reporting period:
- `Focused = sum(active focus seconds occurring in period)`.
- `Break time = sum(active break seconds occurring in period)`.
- `Extra = sum(manual pause seconds occurring in period) + sum(break overage seconds attributable to period)`.
- `Break count` only secondary (logged/completed break entries); not a homepage stat.

**Canonical example:** 11:00 Start → 11:30 Pause → 12:04 Resume → 12:34 focus completes = **60m focused, 34m manual pause, 94m elapsed**. Automatic break 12:34–12:57 (23m) = 15m included, 8m overage. Combined extra = **42m**. (If focus ended at 12:35 after a 35m pause, combined extra would be 43m.)

Period boundaries: Report by configured IANA time zone; weeks are Mon–Sun. If an interval crosses a reporting boundary, split its duration at that boundary rather than crediting the entire amount to its starting date. Attribution of break overage starts after `break_started_at + allowance`, so only those overage seconds count in the specific day/period. The cutoff usually prevents active cross-midnight sessions, but implement correct segmentation.

### 3.2 Week (default tab)
- Header `Your Week` + date range + previous/next arrows (no monthly navigation).
- Only 3 principal numbers: **Focused**, **Break time**, **Extra time**.
- One clear chart with seven bars (Mon–Sun) representing daily extra seconds/minutes; optionally segment each bar into manual pauses vs break overage using two muted, distinguishable colors and tooltip. Avoid adding many charts or badges.
- Click/tap any day to enter Day.

### 3.3 Day
- Same 3 totals, secondary `Extra time split: pauses / extended breaks` with restrained stacked bar or two labels.
- Scrollable chronological log grouped into Pomodoro **cycles**: focus session and its following break, plus orphan incomplete focus or last break if present. A session shows real start–end clock labels, active focus, paused seconds. A break shows elapsed and extra. A day can have several work blocks because End Session can be pressed multiple times.
- Count of breaks may appear as context near activity list only.
- Tap focus or break to see session detail.

### 3.4 Session / cycle detail
- Focus: exact local start/end clock times; active focus, manual pauses, system interruption separately; configured target; completion/early-end reason; ordered focus/pause/interruption intervals with start/end times and proportional timeline.
- Break: exact start/end, total, included, overage, allowance configured for that break, end reason.
- Preserve no more than necessary in the default view; detail can scroll.
- Current in-progress entries may display live elapsed provisional values, labeled clearly, but do not double-count finalized data.

## 4. Data retention / schema principles

Use Supabase/PostgreSQL, UTC timestamps (`timestamptz`), `user_id` owner keys, UUID IDs, and user-specific RLS for all tables. Store exact *events and intervals*, not a 1-row-per-second heartbeat history. Include a clear migration SQL file.

Recommended tables:
1. `profiles` — `user_id`, avatar storage path, IANA `time_zone`, created/updated timestamps.
2. `user_settings` — `user_id`, `focus_target_seconds` default 3600, `break_allowance_seconds` default 900, `daily_cutoff_local` default `20:30`, version/update timestamps.
3. `work_blocks` — UUID, owner, started_at, ended_at, end_reason (`manual`, `daily_cutoff`); groups one continuous Start→(break→Start)*→End Session/cutoff period.
4. `focus_sessions` — UUID, owner, block_id, `started_at`, `ended_at`, `target_seconds_snapshot`, status (`running`,`paused`,`completed`,`ended_early`), end_reason, relevant derived totals/cache if convenient. **Interval data is authoritative.**
5. `focus_intervals` — UUID, owner, focus_session_id, `kind` (`focus`,`manual_pause`,`system_interruption`), `started_at`, `ended_at`, `timestamp_quality` (`observed`,`inferred`) and optional reason. One open interval max per active focus session.
6. `break_sessions` — UUID, owner, block_id, focus_session_id nullable if needed, `started_at`, `ended_at`, `allowance_seconds_snapshot`, `end_reason` (`next_start`,`manual`,`daily_cutoff`).
7. `activity_events` — UUID idempotency key, owner, session/block reference, event type (`start`,`pause`,`resume`,`page_closed`,`recovered`,`focus_completed`,`break_started`,`break_ended`,`end_session`,`daily_cutoff`, `settings_changed`), `occurred_at`, `recorded_at`, `payload` jsonb; append-only where practical. Events are a helpful audit/rebuild trail, not an excuse for a full event-sourcing framework.

Avoid inconsistent duplicate totals: if cached values exist, recompute and reconcile against intervals. Database constraints/checks should prevent negative durations, interval overlap per session, and duplicate transitions where feasible. Design transactional/idempotent transitions, possibly via Supabase RPC/Postgres functions, so rapidly pressing Start or retrying a network request does not double-create focus sessions or breaks.

Store session setting snapshots, correct time zone and derived local day, end reasons, and recovery quality so future analytics can evolve without losing detail. Avoid retaining irrelevant personal tracking information. Supabase Storage avatar: authenticated user-owned object names, uploads constrained to images/size limit, private-by-default access or explicitly controlled public URL policy; ensure old upload cleanup.

## 5. Persistence, reliability and correctness

- Database is durable source of historical truth; browser memory/localStorage provides fast rendering, current timer checkpoint, and recovery queue for pending transitions.
- Always persist transition events (Start, Pause, Resume, End Session, completion, cutoff); do not write 60 rows per minute. A moderate local checkpoint (e.g., every 5 seconds) helps crash recovery; throttled cloud heartbeat optional, not a per-second database write.
- Safe client time calculations: update displays with animation/interval timers, but derive elapsed from monotonic time while active and event timestamps. Browser timers may be throttled; don't lose minutes. Be explicit about system-clock change limitations.
- When reopening an active cloud break, reconstruct elapsed and enforce `min(now, cutoff)`. When reopening a cloud active focus after close, keep it paused; do **not** silently decrement it while away.
- Implement correct UTC↔configured local-time cutoff resolution across DST changes and week/day boundaries.
- Auth security: RLS on every user-owned table; never use service-role secret in client; safe env variables prefixed `VITE_` only for public Supabase URL and publishable/anon key. Document Supabase Google OAuth setup and redirect URLs; do not hard-code keys.
- If cloud writes fail, surface a nonintrusive but honest unsynced state and preserve pending transitions locally; retry idempotently on reconnect. Don't claim an event is cloud-saved before acknowledgement.
- No multi-device live conflict resolution for MVP. At minimum, avoid corrupting history if a stale tab attempts to write (version/transaction guard), and document that one active browser is expected.
- Data export to JSON from accessible account history with UTC timestamps and settings; suitable for self-backup. Clearing browser cache must not destroy committed cloud history.
- Explicit logout and no authentication bypass in production.

## 6. Visual design contract

Reference: `reference/DESIGN.md` and https://pomofocus.io/ (layout inspiration); older iPhone-style stopwatch logic is available under `legacy-stopwatch/`. Do not imitate the Pomofocus layout's extra “Short Break/Long Break” tabs, tasks, or crowded Report/Settings controls.

**Tone:** sophisticated, calm, eye-friendly, centered, spacious, readable. Warm off-white background, lightly contrasted panel, dark charcoal type, muted sage-green primary action, minimal shadows. Example design tokens to tune visually: `--bg:#F5F6F3`, `--surface:#FFFFFF`, `--text:#25302E`, `--muted:#717B78`, `--border:#E2E7E2`, `--primary:#3E7064`, `--primary-hover:#305B52`; metric-only secondary accents muted amber `#CE9B58`, soft blue `#6D90B0`, red/clay for overage `#C6776C`. Use high contrast and keyboard focus styles. These are *guidance*, not a rigid requirement.

- Main timer digits should dominate; use tabular numerals, generous negative space and smooth, minimal transitions; no noisy gradients or motivational quotes.
- Metrics may be slightly more colorful (bar segments, simple labels), but remain clean and restrained.
- Responsive phone layout with accessible touch targets; visible hover/focus feedback; prefers-reduced-motion support.
- Keep navigation tiny: Focus, Metrics, avatar/settings. No dashboards on the main timer screen.
- Use icons sparingly; choose coherent type scale. Avoid turning the design into a generic SaaS analytics dashboard.

## 7. Recommended implementation and handoff

- Vite + React + TypeScript, simple CSS/Tailwind if helpful; avoid excessive dependencies.
- Pure domain functions for reducer/state transitions, time accounting, period splitting, cutoff calculation, recovery, and derived stats. UI components call these functions, do not duplicate rules.
- Supabase Auth, Postgres (migrations + RLS) and Storage; use typed data access layer. Cloud credentials are supplied by user, not assumed to exist.
- Test with Vitest for domain calculations and component behavior; Playwright for high-value E2E scenarios. Provide scripts and a `.env.example`.
- Deploy frontend to Vercel or Netlify with README steps; the user handles creating Supabase project and OAuth app (no secrets embedded in repo).
- Prefer explicit milestones within **one** Codex task: (1) scaffold + styled functional timer and local persistence; (2) schema/Auth/cloud persistence and avatar; (3) metrics; (4) complete tests, responsiveness, deployment docs.
- Implement working code, not only a plan or mockups. If external auth credentials are unavailable, finish everything possible, provide runnable local demo/test fixture mode restricted to development, mark setup blockers precisely, and include exact environment/SQL instructions.

## 8. Acceptance criteria: must pass

1. On first visit before cutoff, pressing `Start` starts configured 60m focus. The displayed primary label is exactly `Start`, not `Start Focus`.
2. Pausing after 5m stops countdown at 55m; resuming after 10m still has 55m left and logs 10m manual pause extra. Additional 5m chips accumulate toward the same target.
3. 11:00–12:34 example records wall-clock 94m, focus 60m, manual pause 34m; break begins automatically at 12:34; 23m break ends upon next Start with 8m extra; combined extra 42m.
4. A 12m break yields 0 extra even if another break runs 23m; total extra equals 8m, not 5m.
5. `End Session` confirmation is accessible only from overflow menu, stops current focus or break and returns idle. A later Start begins a new work block; do not count untracked gap.
6. Closing/reloading the browser 5m into focus pauses it, preserving 55m remaining; reopening after one hour still displays 55m and `Resume`; closed hour does NOT become manual pause extra. Simply switching tabs doesn't auto-pause.
7. Closing browser during an active break, then returning 2h later, shows a break elapsed of 2h longer (unless cutoff intervened), and its extra time correctly derived.
8. At configured 20:30 local time, stop focus/break immediately and cap all tracked durations; cannot Start again that day; on next local morning app is idle and awaits Start.
9. If the browser is closed during an active break at 20:00 and reopened tomorrow, the saved break ends at 20:30 (not at tomorrow's opening). If closed in focus, do not count closed-page time as focused or manual extra.
10. Weekly report Monday–Sunday displays three headline metrics, a seven-bar extra-time chart, day navigation, and detailed cycles with original session start/end times and intervals.
11. After session and break history is saved, browser cache cleared and user signed in again, cloud-saved records are still present.
12. RLS tests show that one authenticated user cannot read or write another user's records or avatar objects.
13. No duplicate transitions or double-counted data on rapid double-click or retry.
14. `npm run build`, tests and lint/typechecks pass. Codex documents any unavoidable browser close precision caveat and limitations of no multi-device sync.

## 9. Explicit priorities when tradeoffs arise

Correct accounting / reliable saving > simple one-button flow > usable accessible design > pretty animations > extra metrics. Do not add features not in this document without a clear necessity. Do not expose most stored telemetry on the default UI. Keep the architecture flexible for future view changes.