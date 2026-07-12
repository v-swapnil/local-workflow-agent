import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { $convertToMarkdownString } from '@lexical/markdown';
import { TRANSFORMERS } from './transformers';

export function WysiwygMode({ onChange }: { onChange: (markdown: string) => void }) {
  return (
    <>
      <RichTextPlugin
        contentEditable={
          <ContentEditable className="note-editor-content min-h-[300px] font-sans text-sm outline-none" />
        }
        placeholder={
          <div className="pointer-events-none absolute top-0 select-none text-ui-sm text-ink-600">
            Start writing…
          </div>
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin />
      <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
      <OnChangePlugin
        onChange={(editorState) => {
          editorState.read(() => {
            onChange($convertToMarkdownString(TRANSFORMERS));
          });
        }}
      />
    </>
  );
}
