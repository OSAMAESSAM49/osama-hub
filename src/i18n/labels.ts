import type {
  GoalPriority, GoalStatus, Horizon, IdeaStatus, Priority3, ReviewType, TaskPriority, TaskStatus,
} from '@/types/models'
import { getLang } from '.'

type Pair = [string, string]
const pick = (p: Pair) => (getLang() === 'ar' ? p[0] : p[1])
const labeler = <K extends string>(map: Record<K, Pair>) => (k: K) => pick(map[k])
const optionsOf = <K extends string>(map: Record<K, Pair>) => () =>
  (Object.keys(map) as K[]).map((value) => ({ value, label: pick(map[value]) }))

const TASK_PRIORITY: Record<TaskPriority, Pair> = { low: ['منخفضة', 'Low'], medium: ['متوسطة', 'Medium'], high: ['عالية', 'High'], urgent: ['عاجلة', 'Urgent'] }
export const taskPriorityLabel = labeler(TASK_PRIORITY)
export const taskPriorityOptions = optionsOf(TASK_PRIORITY)

const TASK_STATUS: Record<TaskStatus, Pair> = { pending: ['قيد الانتظار', 'Pending'], inProgress: ['قيد التنفيذ', 'In progress'], completed: ['مكتملة', 'Completed'], cancelled: ['ملغاة', 'Cancelled'] }
export const taskStatusLabel = labeler(TASK_STATUS)
export const taskStatusOptions = optionsOf(TASK_STATUS)

const PRIORITY3: Record<Priority3, Pair> = { low: ['منخفضة', 'Low'], medium: ['متوسطة', 'Medium'], high: ['عالية', 'High'] }
export const priority3Label = labeler(PRIORITY3)
export const priority3Options = optionsOf(PRIORITY3)

const IDEA_STATUS: Record<IdeaStatus, Pair> = { new: ['جديدة', 'New'], planned: ['مخططة', 'Planned'], inProgress: ['قيد التنفيذ', 'In progress'], published: ['منشورة', 'Published'], archived: ['مؤرشفة', 'Archived'] }
export const ideaStatusLabel = labeler(IDEA_STATUS)
export const ideaStatusOptions = optionsOf(IDEA_STATUS)
export const IDEA_STATUSES = Object.keys(IDEA_STATUS) as IdeaStatus[]

const IDEA_CATEGORY: Record<string, Pair> = {
  dentalEducation: ['تعليم طب الأسنان', 'Dental Education'], patientEducation: ['توعية المرضى', 'Patient Education'], clinicalCases: ['حالات سريرية', 'Clinical Cases'],
  personalBranding: ['العلامة الشخصية', 'Personal Branding'], marketing: ['تسويق', 'Marketing'], dentispace: ['Dentispace', 'Dentispace'], business: ['أعمال', 'Business'],
  aiTech: ['الذكاء الاصطناعي والتقنية', 'AI & Technology'], youtube: ['يوتيوب', 'YouTube'], other: ['أخرى', 'Other'],
}
export const ideaCategoryLabel = (k: string) => (IDEA_CATEGORY[k] ? pick(IDEA_CATEGORY[k]) : k)
export const ideaCategoryOptions = optionsOf(IDEA_CATEGORY)

const PLATFORM: Record<string, Pair> = {
  instagram: ['إنستجرام', 'Instagram'], facebook: ['فيسبوك', 'Facebook'], reels: ['ريلز', 'Reels'], youtube: ['يوتيوب', 'YouTube'], course: ['دورة تعليمية', 'Course'], website: ['موقع', 'Website'], other: ['أخرى', 'Other'],
}
export const platformLabel = (k: string) => (PLATFORM[k] ? pick(PLATFORM[k]) : k)
export const platformOptions = optionsOf(PLATFORM)

const CONTENT_TYPE: Record<string, Pair> = {
  reel: ['ريل', 'Reel'], post: ['منشور', 'Post'], carousel: ['كاروسيل', 'Carousel'], video: ['فيديو طويل', 'Long video'], story: ['ستوري', 'Story'], article: ['مقال', 'Article'], campaign: ['حملة', 'Campaign'], lesson: ['درس', 'Lesson'], other: ['أخرى', 'Other'],
}
export const contentTypeLabel = (k: string) => (CONTENT_TYPE[k] ? pick(CONTENT_TYPE[k]) : k)
export const contentTypeOptions = optionsOf(CONTENT_TYPE)

const VOICE_CATEGORY: Record<string, Pair> = {
  personal: ['خواطر شخصية', 'Personal Thoughts'], clinic: ['العيادة', 'Clinic'], ideas: ['أفكار محتوى', 'Content Ideas'], business: ['أعمال', 'Business'], learning: ['تعلّم', 'Learning'], reminders: ['تذكيرات', 'Reminders'], family: ['الأسرة', 'Family'], other: ['أخرى', 'Other'],
}
export const voiceCategoryLabel = (k: string) => (VOICE_CATEGORY[k] ? pick(VOICE_CATEGORY[k]) : k)
export const voiceCategoryOptions = optionsOf(VOICE_CATEGORY)

const HORIZON: Record<Horizon, Pair> = {
  y10: ['رؤية 10 سنوات', '10-Year Vision'], y5: ['أهداف 5 سنوات', '5-Year Goals'], y3: ['أهداف 3 سنوات', '3-Year Goals'], annual: ['أهداف سنوية', 'Annual Goals'],
  quarterly: ['معالم ربع سنوية', 'Quarterly Milestones'], monthly: ['أهداف شهرية', 'Monthly Objectives'], weekly: ['خطوات أسبوعية', 'Weekly Actions'],
}
export const horizonLabel = labeler(HORIZON)
export const horizonOptions = optionsOf(HORIZON)
export const HORIZONS = Object.keys(HORIZON) as Horizon[]

const GOAL_PRIORITY: Record<GoalPriority, Pair> = { low: ['منخفضة', 'Low'], medium: ['متوسطة', 'Medium'], high: ['عالية', 'High'], critical: ['حرجة', 'Critical'] }
export const goalPriorityLabel = labeler(GOAL_PRIORITY)
export const goalPriorityOptions = optionsOf(GOAL_PRIORITY)

const GOAL_STATUS: Record<GoalStatus, Pair> = { notStarted: ['لم يبدأ', 'Not started'], inProgress: ['قيد التنفيذ', 'In progress'], onHold: ['متوقف مؤقتًا', 'On hold'], completed: ['مكتمل', 'Completed'], cancelled: ['ملغى', 'Cancelled'] }
export const goalStatusLabel = labeler(GOAL_STATUS)
export const goalStatusOptions = optionsOf(GOAL_STATUS)

const REVIEW_TYPE: Record<ReviewType, Pair> = { weekly: ['مراجعة أسبوعية', 'Weekly review'], monthly: ['مراجعة شهرية', 'Monthly review'], annual: ['مراجعة سنوية', 'Annual review'] }
export const reviewTypeLabel = labeler(REVIEW_TYPE)
