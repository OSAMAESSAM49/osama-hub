import { useEffect, useRef } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Heading2, Italic, List, ListOrdered, Quote, Redo2, Undo2, type LucideIcon } from 'lucide-react'
import { cx } from '@/components/common/ui'
import { useI18n } from '@/i18n'

/**
 * A rich text editor built on Tiptap instead of the deprecated document.execCommand. Its schema
 * also sanitises content: anything outside it (scripts, handlers, unsafe links) is dropped on load,
 * including content arriving from a restored backup.
 */
export default function RichText({ value, onChange, placeholder, serif, minimal }: {
  value: string
  onChange: (html: string, plain: string) => void
  placeholder?: string
  serif?: boolean
  minimal?: boolean
}) {
  const { tr } = useI18n()
  const lastValue = useRef(value)
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } })],
    content: value,
    editorProps: { attributes: { class: cx('prose-hub', serif && 'font-reading text-[1.08rem]'), dir: 'auto' } },
    onUpdate: ({ editor: e }) => {
      const html = e.isEmpty ? '' : e.getHTML()
      lastValue.current = html
      onChange(html, e.getText({ blockSeparator: ' ' }).trim())
    },
  })

  // Picks up changes from elsewhere (such as a sync) without moving the cursor while typing.
  useEffect(() => {
    if (!editor || editor.isDestroyed || value === lastValue.current) return
    lastValue.current = value
    if (!editor.isFocused) editor.commands.setContent(value, { emitUpdate: false })
  }, [editor, value])

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive('bold') ?? false,
      italic: e?.isActive('italic') ?? false,
      h2: e?.isActive('heading', { level: 2 }) ?? false,
      bullet: e?.isActive('bulletList') ?? false,
      ordered: e?.isActive('orderedList') ?? false,
      quote: e?.isActive('blockquote') ?? false,
      empty: e?.isEmpty ?? true,
    }),
  })

  if (!editor) return <div className="skeleton h-40" />

  const btn = (icon: LucideIcon, label: string, on: boolean, run: () => void) => {
    const Icon = icon
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-pressed={on}
        onMouseDown={(e) => e.preventDefault()}
        onClick={run}
        className={cx('grid size-9 shrink-0 place-items-center rounded-full transition', on ? 'bg-ink text-canvas' : 'text-muted hover:bg-line')}
      >
        <Icon className="size-4.5" />
      </button>
    )
  }

  return (
    <div className="rounded-3xl bg-raised p-1.5">
      {!minimal && (
        <div role="toolbar" aria-label={tr('تنسيق النص', 'Text formatting')} className="no-scrollbar flex gap-0.5 overflow-x-auto pb-1">
          {btn(Bold, tr('عريض', 'Bold'), active?.bold ?? false, () => editor.chain().focus().toggleBold().run())}
          {btn(Italic, tr('مائل', 'Italic'), active?.italic ?? false, () => editor.chain().focus().toggleItalic().run())}
          {btn(Heading2, tr('عنوان', 'Heading'), active?.h2 ?? false, () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
          {btn(List, tr('قائمة نقطية', 'Bullet list'), active?.bullet ?? false, () => editor.chain().focus().toggleBulletList().run())}
          {btn(ListOrdered, tr('قائمة مرقمة', 'Numbered list'), active?.ordered ?? false, () => editor.chain().focus().toggleOrderedList().run())}
          {btn(Quote, tr('اقتباس', 'Quote'), active?.quote ?? false, () => editor.chain().focus().toggleBlockquote().run())}
          <span className="ms-auto flex gap-0.5">
            {btn(Undo2, tr('تراجع', 'Undo'), false, () => editor.chain().focus().undo().run())}
            {btn(Redo2, tr('إعادة', 'Redo'), false, () => editor.chain().focus().redo().run())}
          </span>
        </div>
      )}
      <div className="relative rounded-[1.25rem] bg-surface p-4">
        {active?.empty && placeholder && <span aria-hidden className="pointer-events-none absolute inset-x-4 top-4 text-faint">{placeholder}</span>}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
