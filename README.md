# Fitness Tracker (FitTrack)

A personal training and health app, built as a Progressive Web App for one iPhone.
Everything is stored on the phone. There is no login, no server, and nothing paid.

**Status: Stage 3 of 9.** New in Stage 3: lifting workouts with automatic
weight targets (progressive overload), routine editing, per-exercise history
and records, and a stretch library with photos. Also working: Today screen, sleep score with calendar and
stats, water, supplements, daily reset, offline use, the training plan engine
(phases, weekly volume, day-by-day schedule, baseline tests and zones), goal
events, session logging, skip / move, busy-week mode, knee protection, and
"other activity" logging.

To see the whole generated plan as a table: `node tools/print-plan.mjs`

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
js/plan-service.js      loads plan data from storage for the screens
js/lib/                 small helpers (HTML templating, dates)
js/logic/               pure calculations, covered by tests
js/engine/plan.js       builds the whole training plan from settings
js/engine/schedule.js   places a week's sessions on days (the rules live here)
js/engine/adjust.js     skips, moves, busy week, knee protection, statuses
js/engine/zones.js      heart-rate and pace zones from baseline tests
js/engine/overload.js   lifting targets: add weight, repeat, or deload
js/lift-service.js      exercise library, routines, the workout in progress
js/ui/                  rings, icons, bottom sheet, toast, session rows
js/sheets/              water, supplements, sleep, session and log sheets
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
- `logs`: every logged session, test and other activity.
- `exercises`: the exercise library. Exercises are archived, never deleted, and
  lifting history lives in `logs`, so swapping or removing an exercise from a
  routine keeps its history.
- `stretches`: your stretches, each with a compressed photo.
- `kv` also holds `routines` (Day A / B / C) and `activeWorkout` (the workout
  in progress, saved after every tap).
- `overrides`: changes you made to planned sessions (skipped, moved, made easy,
  swapped to bike), keyed by session id.

The plan itself is not stored. It is rebuilt from Settings every time, so
changing a goal event or any number regenerates it, and session ids
(`weekStart|kind|n`) stay the same so logs remain attached.
