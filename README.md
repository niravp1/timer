# Focus Tracker

A personal focus and break timer with Google sign-in, private account history, and weekly metrics.

## Preview and verify locally

Use Node 22.12+ on the Node 22 release line, or Node 24 or 26.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. With no Supabase variables configured, the dev server uses a local browser fixture. Start a timer, pause or reload it, then open **Metrics** to drill down from week to day to session. The fixture is available only in development.

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Vitest runs the timer and reporting tests, and applies the actual migration to embedded PostgreSQL with Supabase-compatible auth and storage test fixtures. Playwright exercises the local fixture on desktop and mobile Chromium. To preview the compiled app with real authentication, configure the variables below before building, then run `npm run preview`. Without configuration, the production app shows a setup message.

## Configure Supabase and Google sign-in

1. Create a Supabase project. In its SQL Editor, run [the Focus Tracker migration](supabase/migrations/202611110001_focus_tracker.sql) once. It creates the tracker tables, RLS policies, transactional RPCs, and private `avatars` bucket.
2. In Google Cloud, configure the OAuth consent screen and create an OAuth client of type **Web application**. If the app is in testing, add your Google account as a test user. Add the Google callback URL displayed in the Supabase Google provider setup as an **Authorized redirect URI**. It normally looks like `https://<project-ref>.supabase.co/auth/v1/callback`. [Supabase Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
3. In Supabase, enable the Google provider and enter the Google OAuth client ID and secret. Keep the secret in Supabase.
4. In Supabase **Auth → URL Configuration**, set **Site URL** to the deployed app origin. Add the exact allowed origins for local development and production, such as `http://localhost:5173` and `https://focus.example.com`. Add `http://localhost:4173` if you use the Vite preview there. The app uses the current origin as its post-login redirect. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
5. Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL` to the project URL and `VITE_SUPABASE_PUBLISHABLE_KEY` to its publishable or legacy anon key. Client build variables are public. Keep service-role keys and OAuth secrets out of these files and the frontend.

## Deploy and smoke-test

Use Vite on your static host with `npm ci`, `npm run build`, and output directory `dist`. Supply both public variables in the host's build environment, then add the deployed HTTPS origin to Supabase's redirect list.

Sign in with Google on the deployed URL. Start and end a focus session, wait for the pending-sync notice to clear, then sign in from a fresh browser context and check that the session appears in Metrics. Test uploading an avatar, downloading JSON, and signing out. A configured Supabase project and Google OAuth client are required for this live smoke test.

## How tracking and sync work

- Start during a break closes that break and starts the next focus cycle at the same timestamp. Each cycle snapshots its focus target and break allowance. Each work block snapshots the time zone and cutoff at its start. Metrics use the current reporting time zone.
- Closing or reloading during focus records the observed `pagehide` boundary when the browser delivers it. If the browser crashes or kills the page, recovery uses the last saved checkpoint and marks the boundary as inferred. The five-second checkpoint cadence can be delayed by browser throttling. A cloud-only recovery uses the most recent acknowledged transition. Breaks continue across closure and stop at the exact cutoff, reconciled when the browser returns.
- Timer calculations use a monotonic clock while the page is active and UTC wall time across page loads. Large wall-clock corrections across visits and browsers that pause their monotonic clock during device sleep can affect timing.
- PostgreSQL stores UTC timestamps and structured cycles and intervals in one document per work block, plus separate append-only activity events. The write RPC validates interval continuity, checks the account revision, and commits the updated blocks, events, and receipt in one transaction. A retried batch returns its original receipt.
- A browser journal stores transitions locally and retries after temporary sync failures. Use one active browser per account. Browsers with Web Locks also prevent a second tab from opening the same tracker. A stale writer cannot overwrite newer cloud history. If a conflict occurs, export the local copy before clearing this site's browser storage and reopening the account. Pending local changes can be lost if browser storage is cleared before they sync.
- JSON exports include the activity available in the current browser, settings, interval boundaries, and event timestamps in UTC epoch milliseconds. History is read-only in the UI.

See [SPEC.md](SPEC.md) for the product contract and [TEST_SCENARIOS.md](TEST_SCENARIOS.md) for timing examples.
