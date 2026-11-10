# Testing checklist and status

Status of the build as handed over.

- **Tested** means it was run: automated tests, or driven in a real browser.
- **Live** means it was checked on the deployed site against the real Firebase project.
- **Not run** means it has not been executed yet.

## Run the tests

```bash
npm test
```

Runs 96 tests: finance, dates, search, CSV, the sync engine, backup, links, and the Deen dataset.

```bash
npm run test:rules
```

Security rules tests. **Needs Java 11+** for the Firebase emulators.

To try the app against the local Auth emulator (no real project involved), use the `.env.emulator` values shown in [the section below](#try-it-against-the-emulators).

## Verified live (5 Nov 2026)

On https://osamaessam49.github.io/osama-hub/, project `osama-hub-eg`, using the owner account:

- [x] GitHub Actions: tests pass, the build succeeds, and the site deploys
- [x] Firebase config and Thmanyah fonts present in the deployed build
- [x] A note and an income record reach Firestore, marked synced only after confirmation, with an empty queue
- [x] Money stored as an integer (1.50 EGP is `150`)
- [x] Simulated second device: a record removed locally comes back from the cloud
- [x] Deletes reach Firestore as tombstones
- [x] Live rules refuse (403): signed-out reads and writes, another user's reads and writes, unknown collections, the user root document, writes with no server timestamp, hard deletes, and float, negative, zero, text or badly dated money
- [x] Live rules allow the owner's own data
- [x] New sign-ups disabled, with one account in the project
- [x] Personal finance entries sync from a real phone (10 Nov 2026, confirmed by the owner)

## Not run yet

| Item | Why | How to run it |
| --- | --- | --- |
| **Full rules test suite** ([tests/rules.test.ts](../tests/rules.test.ts)) | This machine has Java 8; the emulators need 11+. The live checks above cover most of its Firestore cases | Install Java 11+, then `npm run test:rules` |
| **A physical second device** | Simulated above | Install on your phone and check that data arrives |
| **Real iPhone and Android devices** | Only phone-size emulation in Chromium so far | Install the PWA, and check Safari in particular |
| **Real microphone and permission denial** | A synthetic audio stream was used | Record on your devices, and deny permission once |
| **Cloud Storage upload and retry** | Needs the Blaze plan; storage rules are not deployed | Only if you opt in |
| **Password reset email delivery** | Not exercised | Use "Forgot your password?" once |
| **Religious content review** | Automated cross-checks cannot replace a person | Have someone qualified spot-check the Deen content |

## Tested

### Clinic finance

- [x] Amounts held as integer piastres, with no floating-point error (unit)
- [x] Arabic digits accepted in amount fields (unit, browser)
- [x] Partner share is a percentage of income minus expenses per month, with no share on a loss month and no carry-over (unit)
- [x] Net = income − expenses − share (unit, browser, with hand-checked figures)
- [x] Payments reduce the balance and never change the net (unit, browser)
- [x] Effective-dated rate changes do not rewrite history (unit)
- [x] Date range presets, including a Saturday week start (unit)
- [x] CSV has a BOM and CRLF, and is protected against formula injection (unit)
- [x] Enter saves and closes, and delete asks for confirmation (browser)

### Sync and offline

- [x] Record and pending operation are written together, and survive a restart (unit)
- [x] Repeated edits merge into one write (unit)
- [x] Nothing shows as synced until the server confirms (unit)
- [x] Edits made during an upload stay queued (unit)
- [x] Network failure keeps everything queued, and a retry creates no duplicates (unit)
- [x] A rejected document does not block the others, and can be retried (unit)
- [x] A request that never answers times out and recovers (unit, and observed in browser)
- [x] Deletes sync as tombstones (unit)
- [x] Delta pull uses a cursor (unit)
- [x] A losing local edit is kept and can be restored (unit)
- [x] Separate database per user (unit)
- [x] Server stopped: app shell reloads, saved data shows, editor and charts load, and new notes save (browser)
- [x] Pending data survives sign-out, sign-in and reload (browser)

### Authentication (real Auth emulator)

- [x] Sign up, sign out, and sign in
- [x] Wrong password shows a clear message
- [x] Session persists across a reload
- [x] Warns about unsynced changes on sign-out

### Voice notes (real MediaRecorder, synthetic audio source)

- [x] Record, pause, resume, stop, preview, save
- [x] Audio stored in IndexedDB before metadata, and labelled "This device only"
- [x] Playback from local storage

### Personal finance

- [x] Income and spending totals, balance, and daily average over elapsed days only (unit)
- [x] Add an expense and an income through the form, including Arabic digits and save & add another (browser)
- [x] List, insights, dashboard card, settings categories and search, at 390px and 320px with no overflow (browser)

### Reports, targets and budgets

- [x] Report figures, partner share on net, target on income or net, budget and category limits (unit)
- [x] Excel workbook built and read back: sheet names, right-to-left, money as numbers with a money format, dates as dates (unit)
- [x] Excel export runs under the production Content Security Policy with no violations (browser, production build)
- [x] PDF preview renders the clinic and personal reports in Arabic at 390px (browser, production build)
- [x] Target and budget set through the form; bars, states and remaining amounts shown on the clinic, personal and home screens (browser)
- [x] "Save as PDF" from the report preview on a real phone (10 Nov 2026, confirmed by the owner)

### Life Compass and links

- [x] Goal phases: created with a new goal, ordered, reordered, progress by slider, auto-complete at 100%, current phase and "done/total" shown, goal progress is the phase average (browser)
- [x] Phase ordering and current-phase rules (unit)

- [x] Goal progress rule, and satisfaction staying separate (unit)
- [x] Goal tree, domain balance view and vision page render (browser)
- [x] Idea, milestone and goal conversion to tasks never duplicates (unit)
- [x] Task and milestone completion stay in step (unit)
- [x] Deleting a goal frees children and tasks, and missing references do not fail (unit)

### Data and Deen

- [x] Backup round trip keeps relationships, shows a preview, and never silently overwrites (unit)
- [x] Invalid backup files are refused (unit)
- [x] 114 surahs, 6,236 ayahs, Tafsir on every ayah, no stray basmalah (build check and unit)
- [x] Only Bukhari and Muslim, with references (unit)
- [x] Stable daily pick, with no repeat across the whole pool (unit)
- [x] Search finds Arabic spelling variants and highlights matches (unit)
- [x] URL validation and duplicate detection (unit)

### PWA and build

- [x] Production build, with the correct paths at a `/osama-hub/` subpath
- [x] Service worker controls the first visit, and caches the Deen content used
- [x] Strict CSP with no violations, and Thmanyah loads under it
- [x] No Thmanyah font file in the build output
- [x] Encrypted font pack opens with the key, and the build falls back without it
- [x] Arabic RTL and English LTR, light and dark, phone and desktop layouts

## Also driven through the real UI

- [x] Deleting a bookmark collection offers to move its links, and moves them
- [x] Customize home: hide a widget and reorder
- [x] Note to journal entry, linked to the note, which stays in place
- [x] Renaming a category keeps its transactions
- [x] Leaving mid-recording warns, and auto-saves the take
- [x] Life Vision autosave and image (resized and stored locally)

## Try it against the emulators

Create `.env.emulator` (git-ignored):

```text
VITE_FIREBASE_API_KEY=demo-key
VITE_FIREBASE_AUTH_DOMAIN=demo-osama-hub.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-osama-hub
VITE_FIREBASE_APP_ID=demo-app
VITE_USE_EMULATORS=true
```

```bash
npm run emulators
```

```bash
npx vite --mode emulator
```

A `demo-` project id cannot reach real Firebase resources.
