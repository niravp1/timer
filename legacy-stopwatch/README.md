# Stopwatch

A standalone, dependency-free stopwatch modeled on the iPhone Clock app's digital stopwatch. The interface reproduces the black screen, large digital readout, round controls, running lap list, and green/red best/worst lap coloring. Only the Stopwatch screen is implemented; the bottom tab icons are visual references, not navigation links.

## Controls

- **Start** begins or resumes timing. **Stop** pauses it.
- **Lap** records the elapsed time since the last lap while the overall stopwatch continues.
- **Reset** clears the stopwatch only when paused.
- **Keyboard**: Space = Start/Stop, L = Lap (running), R = Reset (paused).
- The current partial lap appears at the top, with completed laps in reverse order below it.
- Elapsed time and lap data are retained in this browser using `localStorage`, so reloads and background tabs don't reset timing. Clearing browser storage resets the saved stopwatch.

## Fastest hosting: Netlify Drop

1. Extract this ZIP. You should have a folder named `iphone-stopwatch` containing `index.html`, the icon files, `manifest.webmanifest`, and `sw.js`.
2. Visit https://app.netlify.com/drop and sign in if prompted.
3. Drag the **entire extracted `iphone-stopwatch` folder** into the deploy area (not the ZIP).
4. Netlify returns a public `*.netlify.app` URL. Bookmark it on any device.

No backend, paid server, local computer, build step, or npm installation is required.

## GitHub Pages alternative

1. Create a new public GitHub repository and upload all website files (excluding `README.md`) to its root.
2. In the repository, select **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**, select `main` and `/ (root)`, and save.
4. Your site will be at `https://USERNAME.github.io/REPOSITORY/` after deployment completes.

## Add to iPhone Home Screen

On the deployed HTTPS URL, open Safari → Share → Add to Home Screen. It opens like a standalone app. On supported browsers, the included manifest and service worker can cache it for offline use after its first successful online visit.

## Privacy

Everything runs locally in the browser. No analytics, account, external libraries, or backend. Lap times are stored only in that browser's local storage; they do **not** automatically sync across devices.