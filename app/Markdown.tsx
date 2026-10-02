'use client';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const newTab: Components = { a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> };

/** Markdown + LaTeX, as students see it in the tutor and lessons. Raw HTML is never rendered. */
export default function Markdown({ children, components }: { children: string; components?: Components }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={{ ...newTab, ...components }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
