import type { AppSettings, BookmarkCollection, LifeDomain, WidgetId } from '@/types/models'

export const INCOME_CATEGORIES = [
  { id: 'composite', ar: 'حشوات تجميلية', en: 'Composite Restorations' },
  { id: 'endo', ar: 'علاج الجذور', en: 'Endodontics' },
  { id: 'retreatment', ar: 'إعادة علاج الجذور', en: 'Retreatment' },
  { id: 'prostho', ar: 'التركيبات', en: 'Prosthodontics' },
  { id: 'surgery', ar: 'جراحة الفم', en: 'Oral Surgery' },
  { id: 'ortho', ar: 'تقويم الأسنان', en: 'Orthodontics' },
  { id: 'implants', ar: 'زراعة الأسنان', en: 'Implants' },
  { id: 'other', ar: 'أخرى', en: 'Other' },
]

export const EXPENSE_CATEGORIES = [
  { id: 'materials', ar: 'خامات طب الأسنان', en: 'Dental Materials' },
  { id: 'lab', ar: 'المعمل', en: 'Dental Laboratory' },
  { id: 'salaries', ar: 'الرواتب', en: 'Salaries' },
  { id: 'maintenance', ar: 'الصيانة', en: 'Maintenance' },
  { id: 'rent', ar: 'الإيجار', en: 'Rent' },
  { id: 'utilities', ar: 'المرافق', en: 'Utilities' },
  { id: 'equipment', ar: 'الأجهزة والمعدات', en: 'Equipment' },
  { id: 'marketing', ar: 'التسويق', en: 'Marketing' },
  { id: 'transport', ar: 'الانتقالات', en: 'Transportation' },
  { id: 'other', ar: 'أخرى', en: 'Other' },
]

export const PERSONAL_INCOME_CATEGORIES = [
  { id: 'clinic', ar: 'دخل من العيادة', en: 'From the clinic' },
  { id: 'salary', ar: 'راتب', en: 'Salary' },
  { id: 'freelance', ar: 'عمل إضافي', en: 'Side work' },
  { id: 'teaching', ar: 'تدريس ومحاضرات', en: 'Teaching' },
  { id: 'gift', ar: 'هدية', en: 'Gift' },
  { id: 'investment', ar: 'استثمار', en: 'Investment' },
  { id: 'refund', ar: 'استرداد', en: 'Refund' },
  { id: 'other', ar: 'أخرى', en: 'Other' },
]

export const PERSONAL_EXPENSE_CATEGORIES = [
  { id: 'food', ar: 'أكل ومطاعم', en: 'Food & dining' },
  { id: 'groceries', ar: 'طلبات البيت', en: 'Groceries' },
  { id: 'transport', ar: 'مواصلات', en: 'Transport' },
  { id: 'fuel', ar: 'بنزين وسيارة', en: 'Fuel & car' },
  { id: 'bills', ar: 'فواتير', en: 'Bills' },
  { id: 'home', ar: 'البيت', en: 'Home' },
  { id: 'kids', ar: 'الأولاد', en: 'Kids' },
  { id: 'family', ar: 'الأسرة', en: 'Family' },
  { id: 'health', ar: 'صحة', en: 'Health' },
  { id: 'education', ar: 'تعليم', en: 'Education' },
  { id: 'shopping', ar: 'تسوق وملابس', en: 'Shopping' },
  { id: 'fun', ar: 'ترفيه وخروجات', en: 'Fun & outings' },
  { id: 'charity', ar: 'صدقة وزكاة', en: 'Charity' },
  { id: 'gifts', ar: 'هدايا', en: 'Gifts' },
  { id: 'subscriptions', ar: 'اشتراكات', en: 'Subscriptions' },
  { id: 'other', ar: 'أخرى', en: 'Other' },
]

export const ALL_WIDGETS: WidgetId[] = ['finance', 'personal', 'overview', 'tasks', 'deen', 'transactions', 'compass', 'notes', 'ideas', 'bookmarks', 'voice']

const EPOCH = '2000-01-01T00:00:00.000Z'

export const defaultSettings = (): AppSettings => ({
  id: 'app',
  createdAt: EPOCH,
  updatedAt: EPOCH,
  displayName: '',
  language: 'ar',
  theme: 'system',
  dateFormat: 'long',
  timeFormat: '12',
  weekStart: 6,
  clinicName: '',
  currency: 'EGP',
  partnerName: '',
  // Default 5%, from the beginning of time until the owner changes it.
  partnerRates: [{ from: '0001-01-01', bp: 500 }],
  incomeCategories: INCOME_CATEGORIES,
  expenseCategories: EXPENSE_CATEGORIES,
  personalIncomeCategories: PERSONAL_INCOME_CATEGORIES,
  personalExpenseCategories: PERSONAL_EXPENSE_CATEGORIES,
  widgets: ALL_WIDGETS,
  hiddenWidgets: [],
})

const seedBase = { createdAt: EPOCH, updatedAt: EPOCH }

export const DEFAULT_DOMAINS: { id: string; icon: string; order: number; ar: [string, string]; en: [string, string] }[] = [
  { id: 'career', icon: 'Briefcase', order: 0, ar: ['المهنة والأعمال', 'تطوير المهارات السريرية، الدراسات العليا، نمو العيادة، Dentispace، التعليم، والسمعة المهنية.'], en: ['Career & Business', 'Clinical skills, postgraduate education, clinic growth, Dentispace, teaching and reputation.'] },
  { id: 'family', icon: 'Users', order: 1, ar: ['الأسرة والعلاقات', 'وقت جيد مع الزوجة والأبناء، رحلات وتجارب مشتركة، وتوازن بين العمل والحياة.'], en: ['Family & Relationships', 'Quality time with wife and children, trips, shared experiences and work-life balance.'] },
  { id: 'deen', icon: 'BookOpen', order: 2, ar: ['الدين والروحانية', 'حفظ القرآن وتلاوته، التدبر، طلب العلم الشرعي، المداومة على العبادة، والصدقة.'], en: ['Deen & Spirituality', 'Quran memorization and reading, reflection, Islamic studies, worship and charity.'] },
  { id: 'growth', icon: 'Sprout', order: 3, ar: ['النمو الشخصي والتعلم', 'مهارات جديدة، القراءة، التصميم، التصوير، الفيديو، الذكاء الاصطناعي والتقنية.'], en: ['Personal Growth & Learning', 'New skills, reading, design, photography, video, AI and technology.'] },
  { id: 'finance', icon: 'Landmark', order: 4, ar: ['الحرية المالية', 'الادخار، الأصول، مصادر دخل متعددة، إدارة الالتزامات، امتلاك منزل، واستقرار طويل الأمد.'], en: ['Financial Freedom', 'Savings, assets, multiple income streams, obligations, home ownership and long-term stability.'] },
  { id: 'health', icon: 'HeartPulse', order: 5, ar: ['الصحة ونمط الحياة', 'الرياضة، النوم، الصحة البدنية، الراحة، السفر، وعادات يومية مستدامة.'], en: ['Health & Lifestyle', 'Exercise, sleep, physical health, rest, travel and sustainable routines.'] },
]

export function seedDomains(lang: 'ar' | 'en'): LifeDomain[] {
  return DEFAULT_DOMAINS.map(({ ar, en, ...d }) => ({
    ...seedBase, ...d,
    name: (lang === 'ar' ? ar : en)[0],
    description: (lang === 'ar' ? ar : en)[1],
    satisfaction: null,
    archived: false,
  }))
}

const COLLECTIONS: [string, string, string][] = [
  ['dental', 'مراجع طب الأسنان', 'Dental Resources'],
  ['ai', 'أدوات الذكاء الاصطناعي', 'AI Tools'],
  ['design', 'التصميم الجرافيكي', 'Graphic Design'],
  ['video', 'مونتاج الفيديو', 'Video Editing'],
  ['business', 'الأعمال والتسويق', 'Business & Marketing'],
  ['learning', 'التعلم والدورات', 'Learning & Courses'],
  ['websites', 'مواقع', 'Websites'],
  ['personal', 'شخصي', 'Personal'],
  ['inspiration', 'إلهام', 'Inspiration'],
]

export function seedCollections(lang: 'ar' | 'en'): BookmarkCollection[] {
  return COLLECTIONS.map(([id, ar, en], order) => ({ ...seedBase, id, name: lang === 'ar' ? ar : en, order }))
}
