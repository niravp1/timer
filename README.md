# Focus Tracker

A personal focus and break timer with Google sign-in, private account history, and weekly metrics.

## Preview and verify locally

Use Node 22.12+ on the Node 22 release line, or Node 24 or 26.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The dev server always uses isolated demo data, even when Supabase variables are available. Start a timer, pause or reload it, then use **Menu → Metrics** to drill down from week to day to session. The fixture is available only in development.

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Vitest runs the timer and reporting tests, and applies the actual migration to embedded PostgreSQL with Supabase-compatible auth and storage test fixtures. Playwright exercises the local fixture on desktop and mobile Chromium. Only a production build uses Supabase. Without configuration, that build shows a setup message.

## Configure Supabase and Google sign-in

1. Create a Supabase project. In its SQL Editor, run the migrations in `supabase/migrations` in filename order. It creates the tracker tables, RLS policies, transactional RPCs, and private `avatars` bucket.
2. In Google Cloud, configure the OAuth consent screen and create an OAuth client of type **Web application**. If the app is in testing, add your Google account as a test user. Add the Google callback URL displayed in the Supabase Google provider setup as an **Authorized redirect URI**. It normally looks like `https://<project-ref>.supabase.co/auth/v1/callback`. [Supabase Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
3. In Supabase, enable the Google provider and enter the Google OAuth client ID and secret. Keep the secret in Supabase.
4. In Supabase **Auth → URL Configuration**, set **Site URL** to the deployed app origin. Allow the exact production origin, such as `https://quiet-focus-timer.vercel.app`. The app uses the current origin as its post-login redirect. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
5. Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL` to the project URL and `VITE_SUPABASE_PUBLISHABLE_KEY` to its publishable or legacy anon key. Client build variables are public. Keep service-role keys and OAuth secrets out of these files and the frontend.

## Deploy and smoke-test

Vercel deploys from `main`. Use Vite on the production host with `npm ci`, `npm run build`, and output directory `dist`. Supply both public variables in the host's build environment, then add the deployed HTTPS origin to Supabase's redirect list.

Sign in with Google on the deployed URL. Start and end a focus session, then sign in from a fresh browser context and check that the session appears in Metrics. Test uploading an avatar, downloading JSON, and signing out. A configured Supabase project and Google OAuth client are required for this live smoke test.

## Completion alerts

Under **Menu → Settings**, choose Soft chime, Double bell, or Silent. Use **Preview sound** to hear the current selection and **Save settings** to keep it. Notifications for focus completion and the end of the included break are on by default. The break keeps counting after its alert. Allow the browser permission prompt when you first press Start, or grant permission from Settings. You can turn notifications off in Settings. Delivery depends on browser and OS settings and requires the page to remain open. Some mobile browsers do not support notifications sent directly by a page.

Use **Menu → End Session** while focus or a break is active, then confirm.

## Profile and recovery

The signed-in user can open **Menu → Profile** to change their picture and set a private username. The username is stored in the user's Supabase Auth metadata and has no role in sign-in or authorization. Profile pictures use the private avatar bucket. The app uses Google sign-in and has no app password. The sign-in screen and Profile both link to [Google Account recovery](https://support.google.com/accounts/answer/7682439).

## How tracking and sync work

Each completed focus goal earns the configured break allowance. Unused time covers later breaks or manual pauses that day. Only time beyond the earned balance counts as Extra.

- Start during a break closes that break and starts the next focus cycle at the same timestamp. Each cycle snapshots its focus target and break allowance. Each work block snapshots the time zone and cutoff at its start. Metrics use the current reporting time zone.
- Closing or reloading during focus records the observed `pagehide` boundary when the browser delivers it. If the browser crashes or kills the page, recovery uses the last saved checkpoint and marks the boundary as inferred. The five-second checkpoint cadence can be delayed by browser throttling. A cloud-only recovery uses the most recent acknowledged transition. Breaks continue across closure and stop at the exact cutoff, reconciled when the browser returns.
- Timer calculations use a monotonic clock while the page is active and UTC wall time across page loads. Large wall-clock corrections across visits and browsers that pause their monotonic clock during device sleep can affect timing.
- PostgreSQL stores UTC timestamps and structured cycles and intervals in one document per work block, plus separate append-only activity events. The write RPC validates interval continuity, checks the account revision, and commits the updated blocks, events, and receipt in one transaction. A retried batch returns its original receipt.
- A browser journal stores transitions locally and retries after temporary sync failures. Use one active browser per account. Browsers with Web Locks also prevent a second tab from opening the same tracker. A stale writer cannot overwrite newer cloud history. Sync retries back off after failures. Separate sessions merge automatically. When histories overlap, the cloud copy takes precedence and the browser copy is archived locally. Settings offers a download of those backups. Pending local changes can be lost if browser storage is cleared before they sync.
- JSON exports include the activity available in the current browser, settings, interval boundaries, and event timestamps in UTC epoch milliseconds. History is read-only in the UI.

See [SPEC.md](SPEC.md) for the product contract and [TEST_SCENARIOS.md](TEST_SCENARIOS.md) for timing examples.
