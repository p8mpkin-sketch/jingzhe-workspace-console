import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { hasSensitiveText, maskSensitiveText } from '@/features/agent/content/sensitivity';

export { hasSensitiveText, maskSensitiveText };

function CodeBlock({ lang, code }: { lang: string; code: string }) {
 const [copied, setCopied] = useState(false);
 const [full, setFull] = useState(false);
 const copy = async () => {
 try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  const head = (
    <div className="flex items-center gap-2 px-2.5 py-1 bg-jz-elevated">
      <span className="text-xs font-mono text-jz-text-muted">{lang || 'text'}</span>
      <span className="flex-1" />
      <button onClick={copy} className="text-xs text-jz-text-muted hover:text-neon-accent" data-copy-btn>
        {copied ? '✓ 已复制' : '⧉ 复制'}
      </button>
      <button onClick={() => setFull(true)} className="text-xs text-jz-text-muted hover:text-neon-accent" data-fullscreen-btn title="全屏预览(ESC 关)">
        ⛶ 全屏
      </button>
    </div>
 );
 const pre = (cls: string) => (
    <pre className={`overflow-auto ${cls} text-[12px] leading-5 font-mono text-jz-text-secondary`}
 style={{ fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace' }}>{code}</pre>
  );
  return (
    <>
      <div className="my-2 rounded-lg overflow-hidden" data-md-codeblock>
        {head}
        {pre('p-3 overflow-x-auto')}
      </div>
      {full && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" data-code-fullscreen
 onClick={() => setFull(false)}
 onKeyDown={(e) => e.key === 'Escape' && setFull(false)}>
          <div className="max-w-5xl w-full max-h-full rounded-xl bg-jz-bg overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {head}
            {pre('p-4 h-[75vh]')}
          </div>
        </div>
      )}
    </>
  );
}

/** R327: 风险等级关键词内联 Tag——正则拆段染色(V1.0 模块 D「内置彩色 Tag 渲染」) */
const RISK_TAGS: Array<[RegExp, string, string]> = [
 [/高危|严重|critical/i, 'bg-vuln-critical/15 text-vuln-critical border-vuln-critical/40', 'risk-high'],
 [/中危|medium/i, 'bg-vuln-medium/15 text-vuln-medium border-vuln-medium/40', 'risk-med'],
 [/低危|low/i, 'bg-vuln-low/15 text-vuln-low border-vuln-low/40', 'risk-low'],
 [/未声明|未授权|unauthorized/i, 'bg-vuln-high/15 text-vuln-high border-vuln-high/40', 'risk-unauth'],
 [/合规|安全通过|compliant/i, 'bg-vuln-safe/15 text-vuln-safe border-vuln-safe/40', 'risk-ok'],
];
function RiskInline({ text }: { text: string }) {
 // 按"高危|严重|…"首个命中词拆段;命中词染 Tag,其余原样
 const all = RISK_TAGS.map(([re]) => re.source).join('|');
  const parts = text.split(new RegExp(`(${all})`, 'i'));
  if (parts.length === 1) return <>{text}</>;
  return <>{parts.map((seg, i) => {
 if (!seg) return null;
 const hit = RISK_TAGS.find(([re]) => re.test(seg));
    if (!hit) return <React.Fragment key={i}>{seg}</React.Fragment>;
    return <span key={i} data-risk-tag={hit[2]}
 className={`inline-flex px-1 rounded border text-[12px] font-semibold ${hit[1]}`}>{seg}</span>;
  })}</>;
}

export const MarkdownMessage: React.FC<{ content: string; maskSecrets?: boolean }> = ({ content, maskSecrets = true }) => (
  // R117-8①: 容器防撑裂——min-w-0 max-w-full break-words(长 Base64/Token 不再撑爆气泡与全局布局);
  // 表格/代码块局部横向滚动既有(table 包 overflow-x-auto/pre overflow-x-auto),零外部依赖。
  <div className="md-body text-[14px] leading-[1.75] text-jz-text-secondary min-w-0 max-w-full break-words" data-md-body>
    <ReactMarkdown
 remarkPlugins={[remarkGfm]}
 components={{
 h1: ({ children }) => <h1 className="text-lg font-bold text-jz-text-primary mt-3 mb-1.5">{children}</h1>,
 h2: ({ children }) => <h2 className="text-base font-bold text-jz-text-primary mt-3 mb-1.5">{children}</h2>,
 h3: ({ children }) => <h3 className="text-sm font-semibold text-jz-text-primary mt-2.5 mb-1">{children}</h3>,
 p: ({ children }) => <p className="my-1.5">{typeof children === 'string' ? <RiskInline text={children} /> : children}</p>,
 li: ({ children }) => <li className="marker:text-jz-text-muted">{typeof children === 'string' ? <RiskInline text={children} /> : children}</li>,
 ul: ({ children }) => <ul className="my-1.5 ml-5 list-disc space-y-0.5">{children}</ul>,
 ol: ({ children }) => <ol className="my-1.5 ml-5 list-decimal space-y-0.5">{children}</ol>,
 strong: ({ children }) => <strong className="font-semibold text-jz-text-primary">{children}</strong>,
 em: ({ children }) => <em className="italic">{children}</em>,
 a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-neon-accent hover:underline">{children}</a>,
 blockquote: ({ children }) => <blockquote className="my-2 pl-3 border-l-2 border-jz-border text-jz-text-muted">{children}</blockquote>,
 hr: () => <hr className="my-3 border-jz-border" />,
 code: ({ className, children, ...rest }: any) => {
          const txt = String(children || '').replace(/\n$/, '');
          const isBlock = /language-/.test(className || '') || txt.includes('\n');
          if (isBlock) {
            const lang = (className || '').replace('language-', '');
            return <CodeBlock lang={lang} code={txt} />;
          }
          return <code className="px-1 py-0.5 rounded bg-jz-elevated text-[12px] font-mono text-neon-accent" {...rest}>{txt}</code>;
 },
 table: ({ children }) => (
          <div className="my-3 overflow-x-auto rounded-lg border border-jz-border/50 bg-jz-bg/30" data-md-table-scroll>
            <table className="w-full min-w-[760px] text-[13px] leading-5 border-collapse">{children}</table>
          </div>
 ),
 thead: ({ children }) => <thead className="bg-jz-elevated/90 sticky top-0">{children}</thead>,
 th: ({ children }) => <th className="px-2.5 py-2 text-left font-semibold text-jz-text-primary border-b border-jz-border whitespace-nowrap">{children}</th>,
 td: ({ children }) => <td className="px-2.5 py-2 border-b border-jz-border/60 align-top whitespace-normal break-words max-w-[320px]">{children}</td>,
 }}>
      {maskSecrets ? maskSensitiveText(content) : content}
    </ReactMarkdown>
  </div>
);

export default MarkdownMessage;
