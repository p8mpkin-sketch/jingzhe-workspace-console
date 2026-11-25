// Rendered Markdown of an artifact file. Loaded on demand: the renderer is not part of the workbench chunk.
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MarkdownView: React.FC<{ text: string }> = ({ text }) => (
  <div data-art-markdown className="min-w-0 max-w-full break-words text-label leading-relaxed text-jz-ink-2">
    <ReactMarkdown remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="mb-2 mt-4 text-section font-semibold text-jz-ink first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-1.5 mt-4 text-body font-semibold text-jz-ink first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 mt-3 text-label font-semibold text-jz-ink first:mt-0">{children}</h3>,
        p: ({ children }) => <p className="my-2">{children}</p>,
        ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
        a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer noopener" className="text-jz-brand underline underline-offset-2">{children}</a>,
        code: ({ children }) => <code className="rounded-tag bg-jz-surface-2 px-1 font-mono text-meta text-jz-ink">{children}</code>,
        pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-control bg-jz-surface-2 p-3 font-mono text-meta text-jz-ink-2 [&_code]:bg-transparent [&_code]:p-0">{children}</pre>,
        table: ({ children }) => <div className="my-2 overflow-x-auto"><table className="w-full border-collapse text-left text-meta">{children}</table></div>,
        th: ({ children }) => <th className="border-b border-jz-border-strong px-2 py-1.5 font-medium text-jz-muted">{children}</th>,
        td: ({ children }) => <td className="border-b border-jz-border px-2 py-1.5">{children}</td>,
        blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-jz-border-strong pl-3 text-jz-muted">{children}</blockquote>,
        hr: () => <hr className="my-3 border-jz-border" />,
        img: ({ alt }) => <span className="text-jz-muted">[图片：{alt || '没有说明'}]</span>,
      }}>{text}</ReactMarkdown>
  </div>
);
export default MarkdownView;
