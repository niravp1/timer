# High-value executable test scenarios for Codex

These examples clarify precise expected behavior. Implement as automated domain tests, then representative UI/E2E tests. Use a fake controllable clock and IANA time-zone conversions.

## T1 — Pauses / exact session window
- 11:00:00 Start, 11:30 Pause, 12:04 Resume, 12:34 focus target hit.
- Assert focus active = 3600 s, manual pause = 2040 s, original start = 11:00, focus completed end = 12:34, wall = 5640 s; break began 12:34.
- At 12:57 Start: old break elapsed = 1380 s, break included = 900 s, overage = 480 s, new focus begins 12:57. Total extra so far = 2520 s (42m).

## T2 — Chipping away
- Start at 10:00, focus 5m, pause 10m, focus 5m, pause 5m, focus 50m.
- Complete at 11:15; active 60m, manual pause 15m, elapsed 75m. Ensure no reset while pausing.

## T3 — Per-break allowance
- 12m break then 23m break, allowance 15m each: extra = 0 + 8 = 8m. No carryover or negative extra.

## T4 — Page closed mid focus
- Start 10:00. App closed at 10:05, reopened 11:05. `remaining=55m`, `system_interruption=60m`, `manual_pause=0`, `focus_active=5m`, status paused awaiting Resume. A hidden tab without page close must not pause.

## T5 — Manual pause then close
- Start 10:00; manual pause 10:05; page closes 10:07; return 10:30. Focus 5m, manual extra 2m, system interruption 23m; remaining 55m.

## T6 — Page closed on break
- Focus completed at 12:00; app closes 12:05 and reopens 14:00 same day. Break stopwatch shows elapsed 120m, included 15m, extra 105m; no loss from closure.

## T7 — Automatic cutoff on break
- Break starts 20:00; page closes 20:05; reopened next morning. End recorded at previous day 20:30, break 30m, extra 15m; idle; no tracking overnight.

## T8 — Automatic cutoff on running focus
- Start at 20:20 with 60m target. At 20:30, save 10m focused, mark ended early/cutoff, do not create a new break; disable Start until next local date.

## T9 — Cutoff on system-paused focus
- Start 19:00, close at 19:05, reopen next day. Focus active 5m; interruption extends to 20:30; no manual extra. Finish at cutoff, remain idle until user starts again.

## T10 — End Session
- Focus running for 17m then End Session confirmed => save early focus 17m, no break, no timer until next Start. A break ended by End Session saves elapsed up to that click; subsequent gap untracked. Cancel does nothing.

## T11 — Data / concurrency
- Double click Start or replay same event UUID must not create duplicate sessions or double-count a break. Unauthorized user cannot select another user's data with RLS.

## T12 — Week/day accounting
- Monday–Sunday local week; day chart derives active focus, break totals, and extra from intervals. Break overage begins only after allowance threshold. Correct across DST and any interval spanning midnight. Historical target snapshots never change when user updates defaults.