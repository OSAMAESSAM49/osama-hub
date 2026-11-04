# Architecture

## Data flow

```text
UI (React)
  ↕ useCollection / repo            synchronous snapshots, no loading screens
IndexedDB (osama-hub-{uid})         source of truth for the UI
  ├ records    every record, with local _sync state
  ├ outbox     pending operations, written in the same transaction as the record
  ├ conflicts  losing versions, recoverable from Settings
  ├ blobs      audio and images
  └ meta       per-collection sync cursors
  ↕ sync engine (pull, then push)
Firestore users/{uid}/{collection}/{id}
```

**Why Firestore Lite:** it has no real-time listeners and no SDK cache. Every call is request and response, so a record is marked synced only after Firebase has answered. The SDK's own persistence would hide this, and would duplicate the IndexedDB layer that also has to hold audio.

## Sync rules

| Concern | Rule |
| --- | --- |
| Atomicity | The record and its outbox entry commit in one IndexedDB transaction. |
| Duplicates | Ids are generated on the client, so retries overwrite the same document. |
| Coalescing | The outbox is keyed by document. A later edit replaces the queued one. |
| Edit during upload | Completion only clears an operation whose `opId` still matches. |
| Order | Pull, then push, so conflicts resolve before anything is overwritten. |
| Conflicts | The later `updatedAt` wins. A losing local edit is saved to `conflicts`. |
| Deletes | Tombstones (`deletedAt`), so other devices learn of removals. |
| Reads | Each collection queries `serverUpdatedAt > cursor`, with a 15s overlap for commit ordering. |
| Transient failures | Stay queued with no retry penalty. |
| Rejected documents | Isolated from their batch, marked failed, retried with backoff, listed in Settings. |
| Hanging requests | 20s timeout, treated as a transient failure. |

### States shown to the user

- **Saved locally:** in IndexedDB, not attempted yet (or no Firebase configured).
- **Waiting to sync:** an upload is in progress.
- **Synced:** Firebase confirmed the write.
- **Sync failed:** rejected. The data is kept and can be retried.

Default life domains and bookmark collections use stable ids and are written locally without a queue entry, so seeding costs no writes and a second device cannot duplicate them.

## Clinic finance rules

- Money is an integer number of piastres. Parsing is done on the string, never through floats.
- `Partner share = gross income × rate`, rounded half up once per rate group.
- `Net = income − expenses − partner share`.
- Partner payments reduce the unpaid balance only and never touch the net, so nothing is counted twice.
- Rates are effective-dated (`{ from, bp }`), so changing the rate does not rewrite past periods.
- Dates are local `YYYY-MM-DD` strings, so a timezone cannot move a transaction to another day.

## Goal progress rule

With milestones: the average of milestone progress, where a completed milestone counts 100%. Without milestones: the manual percentage. A completed goal is always 100%. Domain satisfaction (1 to 10) is stored separately and is never derived from any of this.

## Collections

All are under `users/{uid}/`. Types are in [src/types/models.ts](../src/types/models.ts). Every collection has create, read and update through `repo`, and delete by tombstone.

| Collection | Purpose | Special validation in rules |
| --- | --- | --- |
| `settings` | Singleton `app`: profile, preferences, categories, rates, widgets | Envelope |
| `notes` | Quick notes | Envelope |
| `income`, `expenses`, `partnerPayments` | Clinic finance | Positive integer money and a valid date, unless a tombstone |
| `contentIdeas` | Content planning. `taskId` prevents duplicate conversion | Envelope |
| `vaultItems` | Reference data | Envelope |
| `tasks` | `related` references a goal, milestone or idea | Envelope |
| `voiceNotes` | Metadata only. Audio is in `blobs` or Storage | Envelope |
| `bookmarks`, `bookmarkCollections` | Link vault | Envelope |
| `favoriteVerses`, `favoriteHadith`, `deenHistory`, `deenTracking` | Daily Deen, with stable ids | Envelope |
| `lifeDomains`, `lifeVision`, `lifeGoals`, `lifeMilestones`, `lifeReviews`, `lifeJournal` | Life Compass | Envelope |

"Envelope" means: `id` matches the path, `createdAt` and `updatedAt` are strings, and `serverUpdatedAt` equals the commit time. Hard deletes are denied everywhere, and any collection not on this list is denied. No composite indexes are required.

References are resolved at read time by [links.ts](../src/services/data/links.ts), and a missing target shows as missing rather than failing.

## Project layout

```text
src/
  app/            routes, module list
  components/     common (UI kit), layout (shell), forms (rich text), charts
  contexts/       auth
  hooks/          settings, deep-link params
  i18n/           language and theme prefs, inline tr(ar, en), enum labels
  modules/        one folder per feature, each lazy-loaded
  services/
    data/         store, links, backup, Deen, defaults
    firebase/     config, auth
    storage/      IndexedDB, blobs, uploads
    sync/         engine
  types/  utils/  styles/
scripts/          fonts.mjs, fetch-deen-data.mjs
tests/            rules.test.ts (needs emulators)
```

## Decisions worth knowing

- **Translations inline:** `tr('إضافة', 'Add')` keeps both languages beside their context, and neither can go missing.
- **HashRouter:** the only routing that needs no server configuration on GitHub Pages.
- **Tiptap for rich text:** replaces deprecated `execCommand`, and its schema sanitises restored content.
- **Search is local:** it normalizes Arabic spelling, works offline, and costs no reads.
- **CSP in production:** set by a meta tag. `script-src 'self'`, and network only to `*.googleapis.com`.
- **Service worker:** precaches the shell, and runtime-caches only the public Deen dataset. It never caches Firestore or Storage responses.
