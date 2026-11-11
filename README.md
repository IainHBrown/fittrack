# Fitness Tracker (FitTrack)

A personal training and health app, built as a Progressive Web App for one iPhone.
Everything is stored on the phone. There is no login, no server, and nothing paid.

**Status: Stage 1 of 9.** Working now: Today screen, sleep score with calendar and
stats, water, supplements, daily reset, basic settings, offline use.

## Run it on this PC

You need [Node.js](https://nodejs.org) (already installed).

```powershell
cd C:\Users\iainh\fittrack
npm start
```

Then open http://localhost:8080 in a browser. Stop the server with Ctrl+C.

## Run the tests

```powershell
npm test
```

## Deploy

The app is hosted free on GitHub Pages, straight from the `main` branch.
There is no build step: whatever is pushed is what the phone gets.

```powershell
git add -A
git commit -m "Describe the change"
git push
```

GitHub takes about a minute to publish. On the phone, the app picks up a new
version the second time you open it after a deploy (it loads instantly from its
offline copy first, then fetches the update in the background). To force it,
open **Me** and tap **Update app**.

When you add a new file to the app, also add it to the `FILES` list in `sw.js`
(the tests fail if you forget).

## Install on the iPhone

1. Open the GitHub Pages link in **Safari** (it must be Safari).
2. Tap the **Share** button, then **Add to Home Screen**.
3. Keep the name **FitTrack** and tap **Add**.
4. Open it from the Home Screen icon from now on. Data saved in the Home Screen
   app is separate from data saved in the Safari tab.

## Folder layout

```
index.html              page shell
manifest.webmanifest    name, icon and colours for the Home Screen
sw.js                   service worker: offline support
assets/fonts            the two fonts, stored locally
assets/icons            app icon (SVG source and PNG sizes)
css/tokens.css          colours, fonts, sizes
css/base.css            page frame, tab bar, type styles
css/components.css      rings, buttons, sheets, calendar, forms
js/app.js               start-up, tab routing, midnight reset
js/defaults.js          every default value (all editable in Settings)
js/state.js             settings: saved values layered over the defaults
js/db.js                IndexedDB storage
js/lib/                 small helpers (HTML templating, dates)
js/logic/               pure calculations, covered by tests
js/ui/                  rings, icons, bottom sheet, toast
js/sheets/              water, supplements and sleep-score sheets
js/screens/             one file per screen
tests/                  automated tests (npm test)
tools/serve.mjs         local web server for development
```

## How the data is stored

IndexedDB database `fittrack`:

- `kv`: single values. `settings` holds only what you have changed; everything
  else comes from `js/defaults.js`.
- `days`: one record per local date (`YYYY-MM-DD`) with the sleep score, water
  entries and supplement ticks. Water, supplements and food "reset at midnight"
  because a new date starts a new record; old records are never deleted.
