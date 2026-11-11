# Minimal UI design reference

This is a textual replacement for the screenshot attachments in the original handoff archive. The original user example was the Pomofocus home screen at https://pomofocus.io/ . It was provided as *layout inspiration*, not a pixel-perfect target.

## Visual direction
- Wide, uncluttered page with the focal point centered in one quiet rectangular timer panel.
- Simple navigation at top: product name on the left, Metrics and small profile avatar/settings at right.
- At most one large digital time readout, small state label, one primary action button, and a subtle ellipsis menu.
- Use light, desaturated colors and soft contrast. Avoid harsh saturated gradients, overdecorated cards, multiple panels, illustrations, tasks, streaks, or visible analytics on Focus.
- Metrics may use two or three gentle accent colors for focused vs manual-pause vs break-overage distinctions.
- Break stopwatch counts UP; avoid the usual "Short Break" and "Long Break" Pomofocus tabs.
- Respect mobile dimensions, accessibility contrast, reduced-motion, keyboard use, and touch targets.

## Display states
```text
[Focus]                                  [Metrics] [Avatar]

                      FOCUS
                      60:00

                      [ Start ]

                ⋯ End Session (menu only)
```
Running focus: one large countdown with Pause. Paused: frozen countdown and Resume. Break: upward stopwatch and Start, with small extra time label after allowance. Daily cutoff: "Finished for today" and Start disabled.

## Source references
- Pomofocus public website: https://pomofocus.io/
- Prior standalone stopwatch implementation is in `legacy-stopwatch/index.html`, useful for timer logic but **not** the target app architecture.
- Original PNG screenshots remain in the chat's downloadable handoff ZIP, not in this GitHub repository.
