import type { EditorThemeClasses } from 'lexical';

// Maps Lexical node classes to app theme tokens (ink-* / amber) so output renders
// correctly in both light and dark themes.
export const noteEditorTheme: EditorThemeClasses = {
  paragraph: 'text-ink-200 leading-relaxed my-1',
  heading: {
    h1: 'text-xl font-semibold text-ink-50 mt-4 mb-2',
    h2: 'text-lg font-semibold text-ink-50 mt-3 mb-2',
    h3: 'text-base font-semibold text-ink-100 mt-3 mb-1',
  },
  quote: 'border-l-2 border-amber/40 pl-3 italic text-ink-300 my-2',
  list: {
    ul: 'list-disc pl-5 my-1 space-y-0.5',
    ol: 'list-decimal pl-5 my-1 space-y-0.5',
    listitem: 'text-ink-200',
  },
  link: 'text-amber underline underline-offset-2',
  text: {
    bold: 'font-semibold text-ink-50',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    code: 'rounded bg-ink-800/60 px-1 py-0.5 font-mono text-ui-xs text-amber',
  },
  code: 'block rounded-md bg-ink-800/60 p-3 font-mono text-ui-xs leading-relaxed text-ink-200 my-2 whitespace-pre-wrap',
};
