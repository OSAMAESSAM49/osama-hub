/** Data models. Every record is user-scoped at users/{uid}/{collection}/{id}. */

export interface BaseRecord {
  /** Client-generated stable id, which makes retries idempotent and prevents duplicates. */
  id: string
  createdAt: string
  /** Client edit time, used for last-edit-wins conflict resolution. */
  updatedAt: string
  /** Tombstone. Records are kept so other devices learn about the removal. */
  deletedAt?: string | null
}

/** A plain local date, YYYY-MM-DD. Never a timestamp, so timezones cannot shift a transaction's day. */
export type DateStr = string

/** Reference to another record. References are used instead of copying data between modules. */
export interface RecordRef {
  collection: CollectionName
  id: string
}

// ── Notes ──
export interface Note extends BaseRecord {
  title: string
  /** Sanitised rich text produced by the editor schema. */
  content: string
  /** Plain-text version for search and previews. */
  plain: string
  category: string
  tags: string[]
  pinned: boolean
  archived: boolean
}

// ── Clinic finance ──
export interface Income extends BaseRecord {
  amountMinor: number
  date: DateStr
  patientName: string
  procedure: string
  categoryId: string
  description: string
  paymentMethod: string
  notes: string
}
export interface Expense extends BaseRecord {
  amountMinor: number
  date: DateStr
  categoryId: string
  description: string
  supplier: string
  notes: string
}
export interface PartnerPayment extends BaseRecord {
  amountMinor: number
  date: DateStr
  notes: string
}

// ── Personal finance (kept apart from the clinic) ──
export interface PersonalTransaction extends BaseRecord {
  kind: 'income' | 'expense'
  amountMinor: number
  date: DateStr
  categoryId: string
  description: string
  paymentMethod: string
  notes: string
}

// ── Content ideas ──
export type IdeaStatus = 'new' | 'planned' | 'inProgress' | 'published' | 'archived'
export type Priority3 = 'low' | 'medium' | 'high'
export interface ContentIdea extends BaseRecord {
  title: string
  description: string
  category: string
  platform: string
  contentType: string
  tags: string[]
  priority: Priority3
  status: IdeaStatus
  plannedDate: DateStr | null
  links: string[]
  notes: string
  favorite: boolean
  /** The single task created from this idea, so converting twice cannot create a duplicate. */
  taskId: string | null
  goalId: string | null
}

// ── Vault ──
export interface VaultItem extends BaseRecord {
  title: string
  content: string
  category: string
  tags: string[]
  url: string
  pinned: boolean
  archived: boolean
}

// ── Tasks ──
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'pending' | 'inProgress' | 'completed' | 'cancelled'
export interface Task extends BaseRecord {
  title: string
  description: string
  dueDate: DateStr | null
  priority: TaskPriority
  status: TaskStatus
  category: string
  tags: string[]
  completedAt: string | null
  related: RecordRef | null
}

// ── Voice ──
export type VoiceLocation = 'local' | 'cloud' | 'both'
export interface VoiceNote extends BaseRecord {
  title: string
  description: string
  durationSec: number
  recordedAt: string
  category: string
  tags: string[]
  favorite: boolean
  mimeType: string
  sizeBytes: number
  /** The Cloud Storage path, set only after Firebase confirms the upload. */
  storagePath: string | null
  uploadState: 'localOnly' | 'queued' | 'uploading' | 'uploaded' | 'failed'
  uploadError: string | null
}

// ── Links ──
export interface Bookmark extends BaseRecord {
  url: string
  domain: string
  title: string
  description: string
  collectionId: string | null
  tags: string[]
  notes: string
  favorite: boolean
  pinned: boolean
  lastOpenedAt: string | null
}
export interface BookmarkCollection extends BaseRecord {
  name: string
  order: number
}

// ── Daily Deen ──
export interface FavoriteVerse extends BaseRecord {
  surah: number
  ayah: number
}
export interface FavoriteHadith extends BaseRecord {
  book: 'bukhari' | 'muslim'
  number: number
  poolIndex: number
}
export interface DeenHistoryEntry extends BaseRecord {
  date: DateStr
  surah: number
  ayah: number
  hadithPoolIndex: number
}
export interface DeenTracking extends BaseRecord {
  date: DateStr
  quranReadPages: number
  memorization: string
  remembrance: boolean
  reflection: string
}

// ── Life Compass ──
export interface LifeDomain extends BaseRecord {
  name: string
  description: string
  icon: string
  /** Subjective 1 to 10. Never derived from goal or task completion. */
  satisfaction: number | null
  archived: boolean
  order: number
}
export interface VisionSection {
  key: string
  content: string
}
export interface VisionRevision {
  at: string
  content: string
}
export interface LifeVision extends BaseRecord {
  sectionKey: string
  content: string
  plain: string
  imageKey: string | null
  history: VisionRevision[]
}
export type Horizon = 'y10' | 'y5' | 'y3' | 'annual' | 'quarterly' | 'monthly' | 'weekly'
export type GoalPriority = 'low' | 'medium' | 'high' | 'critical'
export type GoalStatus = 'notStarted' | 'inProgress' | 'onHold' | 'completed' | 'cancelled'
export interface LifeGoal extends BaseRecord {
  title: string
  description: string
  domainId: string | null
  horizon: Horizon
  why: string
  expectedOutcome: string
  measurement: string
  startDate: DateStr | null
  targetDate: DateStr | null
  completedAt: string | null
  priority: GoalPriority
  status: GoalStatus
  /** Manual percentage, used while the goal has no milestones. */
  progress: number
  parentId: string | null
  notes: string
  archived: boolean
  /** References to bookmarks, notes, ideas or finance reports. */
  links: RecordRef[]
}
export interface LifeMilestone extends BaseRecord {
  goalId: string
  title: string
  description: string
  dueDate: DateStr | null
  completed: boolean
  progress: number
  taskId: string | null
  /** Position among the goal's phases. Older phases without it follow their creation order. */
  order?: number
}
export type ReviewType = 'weekly' | 'monthly' | 'annual'
export interface LifeReview extends BaseRecord {
  type: ReviewType
  date: DateStr
  answers: Record<string, string>
}
export interface LifeJournal extends BaseRecord {
  title: string
  content: string
  plain: string
  date: DateStr
  mood: string
  tags: string[]
  domainId: string | null
  goalId: string | null
  favorite: boolean
  archived: boolean
  /** Source record when created from a note, voice note or review. */
  source: RecordRef | null
}

// ── Settings ──
export interface FinanceCategory {
  id: string
  ar: string
  en: string
  archived?: boolean
}
export interface ClinicTarget {
  basis: 'income' | 'net'
  amountMinor: number
}
export interface MonthlyBudget {
  totalMinor: number | null
  categories: Record<string, number>
}

export interface PartnerRate {
  /** Applies to income dated on or after this date. */
  from: DateStr
  /** Basis points: 500 means 5%. */
  bp: number
}
export type WidgetId =
  | 'finance' | 'personal' | 'overview' | 'transactions' | 'tasks' | 'notes' | 'bookmarks' | 'ideas' | 'voice' | 'deen' | 'compass'

export interface AppSettings extends BaseRecord {
  displayName: string
  language: 'ar' | 'en'
  theme: 'light' | 'dark' | 'system'
  dateFormat: 'long' | 'dmy' | 'iso'
  timeFormat: '12' | '24'
  weekStart: 0 | 1 | 6
  clinicName: string
  currency: 'EGP'
  partnerName: string
  partnerRates: PartnerRate[]
  incomeCategories: FinanceCategory[]
  expenseCategories: FinanceCategory[]
  personalIncomeCategories: FinanceCategory[]
  personalExpenseCategories: FinanceCategory[]
  /** Monthly clinic target, measured on income or on the final net result. */
  clinicTarget: ClinicTarget | null
  clinicBudget: MonthlyBudget
  personalBudget: MonthlyBudget
  widgets: WidgetId[]
  hiddenWidgets: WidgetId[]
}

export interface CollectionMap {
  settings: AppSettings
  notes: Note
  income: Income
  expenses: Expense
  partnerPayments: PartnerPayment
  personalTransactions: PersonalTransaction
  contentIdeas: ContentIdea
  vaultItems: VaultItem
  tasks: Task
  voiceNotes: VoiceNote
  bookmarks: Bookmark
  bookmarkCollections: BookmarkCollection
  favoriteVerses: FavoriteVerse
  favoriteHadith: FavoriteHadith
  deenHistory: DeenHistoryEntry
  deenTracking: DeenTracking
  lifeDomains: LifeDomain
  lifeVision: LifeVision
  lifeGoals: LifeGoal
  lifeMilestones: LifeMilestone
  lifeReviews: LifeReview
  lifeJournal: LifeJournal
}
export type CollectionName = keyof CollectionMap

export const COLLECTIONS = [
  'settings', 'notes', 'income', 'expenses', 'partnerPayments', 'personalTransactions', 'contentIdeas', 'vaultItems', 'tasks',
  'voiceNotes', 'bookmarks', 'bookmarkCollections', 'favoriteVerses', 'favoriteHadith', 'deenHistory',
  'deenTracking', 'lifeDomains', 'lifeVision', 'lifeGoals', 'lifeMilestones', 'lifeReviews', 'lifeJournal',
] as const satisfies readonly CollectionName[]

/** Local per-record sync state, never sent to the cloud. */
export type SyncState = 'local' | 'pending' | 'synced' | 'failed'
export type Stored<T> = T & { _sync: SyncState }

export interface OutboxOp {
  /** `${collection}/${docId}`: a later edit replaces the queued one, so a doc is written once. */
  key: string
  opId: string
  collection: CollectionName
  docId: string
  type: 'upsert' | 'delete'
  payload: Record<string, unknown>
  timestamp: string
  retryCount: number
  errorStatus: string | null
  /** Earliest time to retry, in epoch ms, after a failure. */
  nextAttemptAt: number
}

/** The losing version of a conflict, kept so that an offline edit is never silently discarded. */
export interface ConflictCopy {
  key: string
  collection: CollectionName
  docId: string
  savedAt: string
  local: Record<string, unknown>
}
