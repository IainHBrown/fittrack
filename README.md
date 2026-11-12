# Fitness Tracker (FitTrack)

A personal training and health app, built as a Progressive Web App for one iPhone.
Everything is stored on the phone. There is no login, no server, and nothing paid.

**Status: Stage 6 of 9.** New in Stages 5 and 6: streaks, XP, levels and
badges, progress charts, a full Settings area (every number and piece of
wording is editable, each page can be reset to defaults), and export / import
of all data as one JSON file (Me, Settings, Backup).

Earlier, in Stage 4: New in Stage 4: food tracking (calories, protein,
carbs, fat) against targets by day type, with a preloaded quick-add list.
Subway values in that list are built from Subway Canada's published nutrition
table (June 2026); dining-hall and staple items are rough estimates. Also
working: lifting with progressive overload, routines, exercise history, the
stretch library, Today screen, sleep score with calendar and
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

## Cloud features (Stage 7): photo estimates and automatic backup

Both run on your own free Cloudflare Worker in `worker/`. Nothing is paid:

- **Workers AI** reads meal photos: 10,000 free "neurons" a day, which is
  roughly 100 or more photo estimates. The Worker also caps estimates at 80 a day.
- **Workers KV** holds the backup: 1 GB and 1,000 writes a day free. The
  Worker keeps the latest backup and the one before it.
- The Worker only answers requests carrying your private passphrase
  (`APP_SECRET`, a Worker secret). It is never in this repository; the app
  stores it only on your phone and leaves it out of every backup.

### One-time setup

1. Create a free account at https://dash.cloudflare.com/sign-up (no card needed).
2. In a terminal, from the `worker` folder:

   ```powershell
   cd C:\Users\iainh\fittrack\worker
   npx wrangler login
   npx wrangler kv namespace create KV
   ```

   Copy the `id` it prints into `wrangler.toml` (replacing `REPLACE_WITH_KV_NAMESPACE_ID`).
3. Deploy, then set the passphrase (you choose it; use four or more random words):

   ```powershell
   npx wrangler deploy
   npx wrangler secret put APP_SECRET
   ```

4. In the app: Me, Settings, Backup. Enter the Worker address that `deploy`
   printed (like `https://fittrack.<your-name>.workers.dev`) and the same
   passphrase, then tap **Test connection**.

To change the Worker later, edit `worker/src/index.js` and run `npx wrangler deploy` again.

## Notifications (Stage 8)

Lock-screen notifications use Web Push (iOS 16.4 or later, and only for the
app installed on the Home Screen). The Worker runs a check every 15 minutes
and sends a notification only when its goal is still not done at its time.
Turn them on in Me, Settings, Notifications, where each one's time, wording
and on/off switch can be changed, and a test can be sent.

The Worker signs each push with a key pair: the public half is in
`worker/wrangler.toml` and `js/defaults.js`; the private half is the Worker
secret `VAPID_PRIVATE_JWK` and exists nowhere else.

## Apple Watch link (Stage 9)

Apple gives web apps no access to Health, so an iPhone Shortcut sends the
data to the Worker and the app collects it from there.

**What Shortcuts can read (checked November 2026):** heart rate, sleep stages,
and running / cycling / swimming distance. It cannot read the sleep score or
workout records. So the app:

- adds up the sleep stages into time asleep each night (the score is still typed in), and
- detects workouts from heart rate, which the watch records every few seconds
  during a workout. Each detected workout appears as a tap-to-fill button
  (duration, average heart rate, distance) when you log a session that day.

### Build the Shortcut (about 10 minutes, once)

In the Shortcuts app, make a new shortcut in the editor and name it `FitTrack Health`.

For **Sleep**, add these three actions:

1. **Find Health Samples**: Type `Sleep`; add filter `Start Date` `is in the last` `2 days`; Sort by `Start Date`, `Oldest First`; Limit off.
2. **Repeat with Each** (it uses the Health Samples from step 1). Inside it add a **Text** action containing three variables separated by `|`:
   `Repeat Item (Start Date)` `|` `Repeat Item (End Date)` `|` `Repeat Item (Value)`.
   For both dates set Date Format to `ISO 8601` and turn on `Include ISO 8601 Time`.
3. After End Repeat, **Set Variable**: name `Sleep`, value `Repeat Results`.

Repeat the same three actions for **Heart Rate** (variable `HeartRate`). Optionally
also for `Cycling Distance` (variable `Cycling`), `Walking + Running Distance`
(`Running`) and `Swimming Distance` (`Swimming`).

Finally add **Get Contents of URL**:

- URL: `https://fittrack.iainhbrown.workers.dev/health`
- Method: `POST`
- Headers: `X-App-Secret` = your passphrase
- Request Body: `JSON`, with Text fields `sleep` = Sleep, `heartRate` = HeartRate
  (and `cycling`, `running`, `swimming` if you added them)

Run it once and allow the Health and network permission prompts.

### Run it automatically

Automation tab, new automation, **App**, choose **FitTrack**, **Is Opened**,
**Run Immediately**, then pick the `FitTrack Health` shortcut. Health data is
locked while the phone is locked, which is why it runs when you open the app.
