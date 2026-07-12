import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { $getRoot } from 'lexical';

export function MarkdownMode({ onChange }: { onChange: (markdown: string) => void }) {
  return (
    <>
      <PlainTextPlugin
        contentEditable={
          <ContentEditable className="note-editor-content min-h-[300px] whitespace-pre-wrap font-mono text-ui-sm text-ink-200 outline-none" />
        }
        placeholder={
          <div className="pointer-events-none absolute top-0 select-none font-mono text-ui-sm text-ink-600">
            # Start writing markdown…
          </div>
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <OnChangePlugin
        onChange={(editorState) => {
          editorState.read(() => {
            onChange($getRoot().getTextContent());
          });
        }}
      />
    </>
  );
}
