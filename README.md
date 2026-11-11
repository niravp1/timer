# Codex Handoff — Minimal Focus & Break Tracker

This directory is a detailed implementation handoff for a new web app. The app **has not been implemented in this bundle**. It includes a precise spec, coding-agent instructions, prior prototype, and screenshots.

## Contents
- `SPEC.md` — authoritative product + engineering specification, calculations, state transitions, cloud data model, design constraints, acceptance tests.
- `AGENTS.md` — repository instructions intended for Codex.
- `CODEX_PROMPT.md` — the task message to paste into Codex.
- `reference/pomofocus-user-reference.png` — screenshot supplied by the user (UI inspiration only).
- `reference/stopwatch-laps-reference.png` — previous prototype screenshot.
- `legacy-stopwatch/` — older single-file stopwatch HTML reference. This is NOT the new app and should not force the framework choice.

## Send to Codex Cloud
1. Extract this folder and upload/commit its **contents** to the root of a new GitHub repository (e.g. `focus-tracker`). Keep screenshot references if you're comfortable storing them in your chosen repo; use private repository if preferred.
2. Open https://chatgpt.com/codex and prepare/select a Codex Cloud environment with access to that repository. A cloud environment must be connected/published before it can run tasks.
3. Open `CODEX_PROMPT.md`, paste the task text in a new Codex task and select the connected environment/repo. Codex should inspect `AGENTS.md` and `SPEC.md`, implement, test, and produce code changes for review.
4. Before enabling real authentication, create a Supabase project. Codex will provide SQL migration and redirect setup steps; you must configure OAuth and environment variables. **Never paste private keys into source control or chats.**
5. After reviewing test results and implementation, deploy the frontend to Vercel or Netlify (after adding your public Supabase URL/key as environment variables and appropriate OAuth redirects). No home computer is required to keep a deployed static app online.

Alternative: with local Codex, open the extracted folder as the working directory and paste the same task prompt. The archive can also be imported/committed into an existing repository, but no existing suitable repository was identified in the current chat.

## Important design policy
Only main Focus UI is intentionally sparse. Insights live under Metrics: Week → Day → Session. Store precise detailed activity for possible future visualizations, without exposing it all today. No Correct Break action.

## Immediate setup instructions

See [`START_HERE.md`](START_HERE.md) for the few remaining steps to create a GitHub repository and start a Codex Cloud coding task.