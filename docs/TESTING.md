# Testing checklist and status

Status of the build as handed over.

- **Tested** means it was run: automated tests, or driven in a real browser.
- **Not run** means the code and tests exist, but they have not been executed. Please do these before relying on the feature.

## Run the tests

```bash
npm test
```

Runs 66 tests: finance, dates, search, CSV, the sync engine, backup, links, and the Deen dataset.

```bash
npm run test:rules
```

Security rules tests. **Needs Java 11+** for the Firebase emulators.

To try the app against the local Auth emulator (no real project involved), use the `.env.emulator` values shown in [the section below](#try-it-against-the-emulators).

## Not run yet: please do these

These need things that were not available when this was built.

| Item | Why it was not run | How to run it |
| --- | --- | --- |
| **Security rules tests** ([tests/rules.test.ts](../tests/rules.test.ts)) | The machine has Java 8; the Firestore and Storage emulators need 11+ | Install Java 11+, then `npm run test:rules` |
| **Sync against real Firestore** | No Firebase project was connected. The engine was tested against an in-memory fake | Set up Firebase, add a record on one device, and check it arrives on another |
| **Data isolation with two real accounts** | Covered by the rules tests above | Sign in as a second user and confirm the first user's data is absent |
| **GitHub Actions and Pages deployment** | Not pushed to GitHub. The build was tested locally at a `/osama-hub/` subpath | Follow the README |
| **Real iPhone and Android devices** | Tested with phone-size emulation in Chromium only | Install the PWA, record with the real microphone, and check Safari in particular |
| **Real microphone and permission denial** | A synthetic audio stream was used to avoid a permission prompt | Record on your devices, and deny permission once to see the message |
| **Cloud Storage upload and retry** | Needs the Blaze plan | Only if you opt in |
| **Password reset email delivery** | The UI and sending call exist, but delivery was not exercised | Use "Forgot your password?" once Firebase is set up |
| **Religious content review** | Automated cross-checks cannot replace a person | Have someone qualified spot-check the Deen content |

## Tested

### Clinic finance

- [x] Amounts held as integer piastres, with no floating-point error (unit)
- [x] Arabic digits accepted in amount fields (unit, browser)
- [x] Partner share is a percentage of gross income, even when expenses exceed income (unit, browser)
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

### Life Compass and links

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
