import Markdown, { Components } from 'react-markdown';

const COMPONENTS: Components = {
  // li: ({ node, ...rest }) => <li {...rest} className="tw-my-1" />,
  ul: ({ node, ...rest }) => <ul {...rest} className="list-disc list-outside pl-5 space-y-2 whitespace-normal" />,
  code: ({ node, ...rest }) => <code {...rest} className='bg-ink-900 text-ink-300 px-1.5 py-0.5 rounded font-mono text-sm"' />,
};

interface MarkdownRendererProps {
  markdown: string;
}

export const MarkdownRenderer = ({ markdown }: MarkdownRendererProps) => {
  return <Markdown components={COMPONENTS}>{markdown}</Markdown>;
};
