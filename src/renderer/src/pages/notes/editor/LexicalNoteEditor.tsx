import { LexicalComposer, type InitialConfigType } from '@lexical/react/LexicalComposer';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { CodeNode, CodeHighlightNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { $convertFromMarkdownString } from '@lexical/markdown';
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
import { noteEditorTheme } from './theme';
import { TRANSFORMERS } from './transformers';
import { WysiwygMode } from './WysiwygMode';
import { MarkdownMode } from './MarkdownMode';

export type NoteEditorMode = 'wysiwyg' | 'markdown';

interface LexicalNoteEditorProps {
  noteId: string;
  mode: NoteEditorMode;
  initialValue: string;
  onChange: (markdown: string) => void;
}

/**
 * Single Lexical composer per (note, mode) pair. Both modes read from and write
 * to the same markdown string, so switching modes round-trips through markdown —
 * remounting via `key` re-initializes the target mode from the current value.
 */
export function LexicalNoteEditor({ noteId, mode, initialValue, onChange }: LexicalNoteEditorProps) {
  const initialConfig: InitialConfigType = {
    namespace: `note-editor-${noteId}-${mode}`,
    theme: noteEditorTheme,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, CodeHighlightNode, LinkNode],
    onError: (error: Error) => {
      console.error('[notes] lexical error', error);
    },
    editorState: () => {
      if (mode === 'wysiwyg') {
        $convertFromMarkdownString(initialValue, TRANSFORMERS);
        return;
      }
      const root = $getRoot();
      root.clear();
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode(initialValue));
      root.append(paragraph);
    },
  };

  return (
    <LexicalComposer key={`${noteId}-${mode}`} initialConfig={initialConfig}>
      <div className="relative">
        {mode === 'wysiwyg' ? <WysiwygMode onChange={onChange} /> : <MarkdownMode onChange={onChange} />}
      </div>
    </LexicalComposer>
  );
}
