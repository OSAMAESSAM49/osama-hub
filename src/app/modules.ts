import {
  Bookmark, BookOpen, Compass, Home, Wallet, Lightbulb, ListChecks, Mic, NotebookPen, Settings, Shield, Stethoscope, type LucideIcon,
} from 'lucide-react'

export interface ModuleDef {
  id: string
  path: string
  icon: LucideIcon
  ar: string
  en: string
  descAr: string
  descEn: string
  /** Colour of this module's card in the stacked deck. */
  bg: string
  fg: string
}

export const MODULES: ModuleDef[] = [
  { id: 'home', path: '/', icon: Home, ar: 'الرئيسية', en: 'Home', descAr: 'نظرة على يومك', descEn: 'Your day at a glance', bg: '#111114', fg: '#fff' },
  { id: 'clinic', path: '/clinic', icon: Stethoscope, ar: 'مالية العيادة', en: 'Clinic Finance', descAr: 'الإيرادات والمصروفات والشريك', descEn: 'Income, expenses and partner', bg: '#3A3FF0', fg: '#fff' },
  { id: 'money', path: '/money', icon: Wallet, ar: 'المالية الشخصية', en: 'Personal Finance', descAr: 'مصروفك ودخلك اليومي', descEn: 'Your daily spending and income', bg: '#A8E6CF', fg: '#111114' },
  { id: 'tasks', path: '/tasks', icon: ListChecks, ar: 'المهام', en: 'Tasks', descAr: 'ما يجب إنجازه', descEn: 'What needs doing', bg: '#C8FF2E', fg: '#111114' },
  { id: 'notes', path: '/notes', icon: NotebookPen, ar: 'الملاحظات', en: 'Quick Notes', descAr: 'دوّن بسرعة', descEn: 'Capture fast', bg: '#EE8A4B', fg: '#111114' },
  { id: 'ideas', path: '/ideas', icon: Lightbulb, ar: 'أفكار المحتوى', en: 'Content Ideas', descAr: 'مساحتك الإبداعية', descEn: 'Your creative workspace', bg: '#7D5CE6', fg: '#fff' },
  { id: 'voice', path: '/voice', icon: Mic, ar: 'الملاحظات الصوتية', en: 'Voice Notes', descAr: 'دفترك الصوتي', descEn: 'Your audio notebook', bg: '#D94A7B', fg: '#fff' },
  { id: 'links', path: '/links', icon: Bookmark, ar: 'خزنة الروابط', en: 'Link Vault', descAr: 'ما يستحق العودة إليه', descEn: 'Worth coming back to', bg: '#2E9C8F', fg: '#fff' },
  { id: 'vault', path: '/vault', icon: Shield, ar: 'البيانات المهمة', en: 'Data Vault', descAr: 'أرقام ومعلومات مرجعية', descEn: 'Reference information', bg: '#5D7385', fg: '#fff' },
  { id: 'deen', path: '/deen', icon: BookOpen, ar: 'الزاد اليومي', en: 'Daily Deen', descAr: 'آية وحديث كل يوم', descEn: 'A verse and hadith each day', bg: '#16382B', fg: '#F6F0DF' },
  { id: 'compass', path: '/compass', icon: Compass, ar: 'بوصلة الحياة', en: 'Life Compass', descAr: 'إلى أين تتجه حياتك', descEn: 'Where your life is heading', bg: '#CDA94F', fg: '#111114' },
  { id: 'settings', path: '/settings', icon: Settings, ar: 'الإعدادات', en: 'Settings', descAr: 'حسابك وبياناتك', descEn: 'Your account and data', bg: '#2A2A30', fg: '#fff' },
]

export const moduleById = (id: string) => MODULES.find((m) => m.id === id)!
