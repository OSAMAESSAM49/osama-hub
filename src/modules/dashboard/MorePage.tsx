import { Link } from 'react-router-dom'
import { MODULES } from '@/app/modules'
import { useI18n } from '@/i18n'

/** The module deck: stacked cards that overlap like a wallet, from the design references. */
export default function MorePage() {
  const { tr, lang } = useI18n()
  return (
    <div className="fade-in">
      <h1 className="mb-5 font-display text-[1.9rem] font-bold sm:text-[2.4rem]">{tr('كل الأقسام', 'Everything')}</h1>
      <div className="deck pb-6">
        {MODULES.filter((m) => m.id !== 'home').map((m) => (
          <Link key={m.id} to={m.path} className="block px-6 pt-5 pb-11" style={{ background: m.bg, color: m.fg }}>
            <div className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-xl font-bold">{lang === 'ar' ? m.ar : m.en}</span>
                <span className="block text-sm opacity-75">{lang === 'ar' ? m.descAr : m.descEn}</span>
              </span>
              <m.icon className="size-7 shrink-0" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
