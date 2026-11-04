# OSAMA HUB

A private, all-in-one personal operating system: dental clinic finance, notes, tasks, content ideas, voice notes, bookmarks, a reference vault, Daily Deen and Life Compass. Arabic-first with full RTL, and English as an alternative. Installable as a PWA and usable offline.

**Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, Firebase (Auth, Firestore, optional Storage), GitHub Pages. No paid server and no Cloud Functions.

- [Run it locally](#run-it-locally)
- [Set up Firebase](#set-up-firebase)
- [Deploy to GitHub Pages](#deploy-to-github-pages)
- [Install on a phone](#install-on-a-phone)
- [Free-tier limits](#free-tier-limits)
- [Backup and restore](#backup-and-restore)
- [Thmanyah font licence](#thmanyah-font-licence)
- [Daily Deen data](#daily-deen-data)
- [Limitations](#limitations)

More detail: [architecture](docs/ARCHITECTURE.md) and [testing checklist](docs/TESTING.md).

## Run it locally

```bash
npm install
```

```bash
npm run dev
```

With no Firebase configuration, the app runs in **local mode**: everything works and stays in this browser, and the sync pill says "On this device". Add Firebase when you want an account and sync.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Type-check and production build |
| `npm test` | Unit tests (finance, sync engine, dataset) |
| `npm run test:rules` | Security rules tests. Needs Java 11+ for the Firebase emulators |
| `npm run fonts:pack` | Encrypt the fonts for CI, see [below](#thmanyah-font-licence) |
| `npm run data:deen` | Rebuild the Quran and Hadith dataset from its sources |

## Set up Firebase

You need a free Google account. All of this is done at [console.firebase.google.com](https://console.firebase.google.com).

### 1. Create the project

1. **Add project**, name it (for example `osama-hub`). Google Analytics is not needed, so turn it off.
2. In the project overview click the web icon (`</>`), register an app, and copy the `firebaseConfig` values. You do not need Firebase Hosting.

### 2. Enable Authentication

1. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
2. **Settings → Authorized domains → Add domain**, and add `YOUR-USERNAME.github.io`.

### 3. Create Firestore

1. **Build → Firestore Database → Create database.** Start in **production mode** and pick a location near you. The location cannot be changed later.
2. No composite indexes are needed: queries use a single field.

### 4. Publish the security rules

Either paste [firestore.rules](firestore.rules) into **Firestore → Rules → Publish**, or use the CLI:

```bash
npm install -g firebase-tools
```

```bash
firebase login
```

```bash
firebase deploy --only firestore:rules --project YOUR-PROJECT-ID
```

The rules scope all data to `users/{uid}/…`, deny everything else, require whole-number piastres for money, and block hard deletes.

### 5. Lock it to one owner

The app is for a single owner, so close the door after you register:

1. Deploy the app and create your account on its sign-up tab.
2. **Authentication → Settings → User actions**, then turn off **Enable create (sign-up)**.

Other people still could not read your data with sign-up on, but this stops them using your free quota.

### 6. Set environment variables

For local development, copy `.env.example` to `.env.local` and fill in the values from step 1. For deployment, they go in GitHub secrets (below). Nothing is hardcoded in the source.

Firebase web config is **not a secret**: it ends up in the public JavaScript by design. Your data is protected by the security rules, not by hiding this config. For extra protection, restrict the API key to your GitHub Pages domain in **Google Cloud Console → APIs & Services → Credentials**.

### 7. Optional: Cloud Storage for voice notes

> **Cloud Storage now requires the pay-as-you-go Blaze plan.** Google's FAQ states that Spark projects have no access to any bucket and get 402/403 errors. Blaze still has a no-cost usage tier, but it requires a billing account. See the [official FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).

By default the app does not need it: recordings stay in the device's IndexedDB, and only their titles and details sync. To opt in:

1. Upgrade to Blaze, then **Build → Storage → Get started**.
2. Publish [storage.rules](storage.rules), via the console or `firebase deploy --only storage --project YOUR-PROJECT-ID`.
3. Set `VITE_FIREBASE_STORAGE_ENABLED=true` (a GitHub repository **variable**, not a secret) and set `VITE_FIREBASE_STORAGE_BUCKET`.

Local recordings are kept on the device even after upload confirms. Set a budget alert in Google Cloud if you enable this.

## Deploy to GitHub Pages

### 1. Prepare the font pack

The font files must not be published, so CI receives them encrypted. Put the Thmanyah `.woff2` files in `fonts-src/` (see [the licence section](#thmanyah-font-licence) for which ones), then:

```bash
npm run fonts:pack
```

This writes `fonts/thmanyah.pack.enc` (safe to commit) and `.font-pack-key` (git-ignored, never commit it).

### 2. Push the code

Create a repository on GitHub, then:

```bash
git init -b main
```

```bash
git add .
```

```bash
git commit -m "Initial commit"
```

```bash
git remote add origin https://github.com/YOUR-USERNAME/osama-hub.git
```

```bash
git push -u origin main
```

Before committing, check that `git status` lists no `.woff2` or `.otf` under `fonts-src/`, and no `Thmanyah-Font-Family.zip`. `.gitignore` already excludes them.

Free GitHub accounts can only publish Pages from **public** repositories. That exposes your source code, but no data: nothing personal is in the repository.

### 3. Add the secrets

**Repository → Settings → Secrets and variables → Actions → New repository secret:**

| Secret | Value |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | From `firebaseConfig` |
| `VITE_FIREBASE_AUTH_DOMAIN` | From `firebaseConfig` |
| `VITE_FIREBASE_PROJECT_ID` | From `firebaseConfig` |
| `VITE_FIREBASE_STORAGE_BUCKET` | From `firebaseConfig` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | From `firebaseConfig` |
| `VITE_FIREBASE_APP_ID` | From `firebaseConfig` |
| `FONT_PACK_KEY` | The contents of `.font-pack-key` |

### 4. Enable Pages

**Repository → Settings → Pages → Build and deployment → Source: GitHub Actions.**

### 5. Deploy

Every push to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml), which runs the tests, builds with the right base path, and publishes. Watch it in the **Actions** tab. Your app is then live at:

```text
https://YOUR-USERNAME.github.io/osama-hub/
```

Routes use the URL hash (`#/clinic`), so refreshing any page works on GitHub Pages with no redirect tricks.

## Install on a phone

- **iPhone or iPad:** open the site in **Safari**, tap **Share**, then **Add to Home Screen**.
- **Android:** open it in **Chrome**, then use the install prompt or menu → **Install app**.
- **Desktop Chrome or Edge:** click the install icon in the address bar.

Settings → App also shows the right steps for your device. Installing also makes browsers much less likely to evict local data.

## Free-tier limits

Check the [Firebase pricing page](https://firebase.google.com/pricing) for current numbers. At the time of writing, the Spark plan's Firestore quota is 50,000 reads, 20,000 writes and 20,000 deletes per day, with 1 GiB stored. One person using this app should stay far below that, because:

- **Reads:** each collection only fetches documents changed since its last sync, with no real-time listeners. An idle sync costs about 21 reads, and runs at most every 5 minutes when you return to the app. All lists and search use the local copy, which costs no reads.
- **Writes:** repeated edits to a record are merged into one queued write, so autosave does not cost a write per keystroke.
- **Audio:** never stored in Firestore.

GitHub Pages is free for public repositories, with a 1 GB site limit and a soft limit of 100 GB of bandwidth per month.

## Backup and restore

**Settings → Data.**

- **Export full backup** downloads a JSON file of every record. Ids are preserved, so links between records survive.
- **Restore from file** validates the whole file first and shows how many records are new, different and identical. Invalid files are refused. You choose what happens to records that differ (keep newer, keep existing, or use the file). Restoring never deletes anything.
- **CSV reports** open correctly in Excel, with Arabic text intact.

Backups are **not encrypted** and hold your financial data, so store them carefully. **Audio is not included:** download important recordings from the Voice page. If you later connect Firebase after using local mode, use a backup to move your data across, because local-mode data and account data are kept in separate databases.

## Thmanyah font licence

The app uses the Thmanyah typeface. Its licence allows embedding in web apps only "as part of a compiled, packaged, or obfuscated product", and forbids hosting the font files or making them available for download. So:

- Raw font files are git-ignored and live only in `fonts-src/` on your machine.
- The repository holds only an AES-256 encrypted pack.
- The build compiles the fonts into an obfuscated JavaScript chunk. No `.woff2` is ever served, and the font data is restored in memory, unmodified.

Files needed in `fonts-src/`, from the `woff2` folders of the font zip: `thmanyahsans-Regular`, `-Medium`, `-Bold`; `thmanyahserifdisplay-Medium`, `-Bold`; `thmanyahseriftext-Regular`.

Obfuscation makes extraction harder but cannot make it impossible, and the licence also bars making fonts extractable "through web embedding". This approach follows the licence's own wording, but it is an engineering reading rather than legal advice. For certainty, ask the publisher at ask@thmanyah.com. The licence is governed by Saudi law, and violations can revoke your right to use the font. If the build has no fonts, it still succeeds and uses a fallback stack.

## Daily Deen data

No religious text is written by hand or by AI. [scripts/fetch-deen-data.mjs](scripts/fetch-deen-data.mjs) downloads published datasets into `public/data/deen/`:

| Content | Source | Cross-checked against |
| --- | --- | --- |
| Quran, Uthmani script | [AlQuran Cloud](https://alquran.cloud/api) `quran-uthmani` | [quran-json](https://www.npmjs.com/package/quran-json) |
| Tafsir Al-Muyassar (King Fahd Complex) | AlQuran Cloud `ar.muyassar` | none |
| Sahih al-Bukhari and Sahih Muslim | [hadith-api](https://github.com/fawazahmed0/hadith-api) | [hadith-json](https://github.com/AhmedBaset/hadith-json) |

The Quran build stops if the text is not exactly 114 surahs and 6,236 ayahs with no mismatches. The sources differ only in spelling convention in some ayahs (for example the hamza seat), so that comparison uses the consonantal skeleton, and the stored text is the unmodified `quran-uthmani` edition. A hadith is included only if both sources carry the same text, it has a full chain reaching the Prophet ﷺ, and it is not from Muslim's introduction. That leaves 5,174 hadith.

Authenticity is stated from the hadith's presence in the Sahih collections, because the datasets do not grade each narration. Numbering follows the hadith-api edition and can differ from other printings. No hadith explanation is shown, since no verified dataset was available. **Please have someone qualified spot-check the content** before relying on it.

## Limitations

- **Audio without Blaze** stays on the device that recorded it. Other devices see the title only.
- **Bookmark details** are entered by hand. Fetching a page's title would need a server or a third-party service that sees your links. Site icons are requested from the bookmarked site itself.
- **Speech-to-text** is not included.
- **Goal attachments** are links to existing records, because file upload needs Blaze. Life Vision images are stored on the device.
- **"Clinic projects"** are a task category, not a separate record type.
- **Local data is not encrypted at rest.** Avoid signing in on shared devices.
- **iOS** may evict website data after long disuse unless installed, and supports `MediaRecorder` only on recent versions.
