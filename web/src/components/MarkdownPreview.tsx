import { useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';
import type { DiffLine } from '@/types';

interface MarkdownPreviewProps {
  content: string;
  currentLine?: number;
}

export interface MarkdownPreviewRef {
  scrollToLine: (line: number) => void;
}

export const MarkdownPreview = forwardRef<MarkdownPreviewRef, MarkdownPreviewProps>(
  function MarkdownPreview({ content }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);

    const html = useMemo(() => renderMarkdown(content), [content]);

    useImperativeHandle(ref, () => ({
      scrollToLine(line: number) {
        if (!containerRef.current) return;

        const elements = containerRef.current.querySelectorAll('[data-line-end]');
        for (const el of elements) {
          const lineEnd = parseInt(el.getAttribute('data-line-end') || '0', 10);
          if (lineEnd >= line) {
            (el as HTMLElement).scrollIntoView({ behavior: 'auto', block: 'center' });
            break;
          }
        }
      },
    }), []);

    return (
      <div
        ref={containerRef}
        className="markdown-preview"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
);

/**
 * Minimal Markdown → HTML renderer (no external deps).
 * For production, replace with a proper library like marked or remark.
 */
function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const lineNum = i + 1;

    // Code blocks
    if (line.startsWith('```')) {
      const langMatch = line.slice(3).trim();
      const language = langMatch || 'plaintext';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      const code = codeLines.join('\n');
      let blockHtml: string;
      try {
        const highlighted = hljs.highlight(code.trim(), { language, ignoreIllegals: true }).value;
        blockHtml = `<pre data-line-end="${i}"><code class="hljs language-${language}">${highlighted}</code></pre>`;
      } catch (e) {
        blockHtml = `<pre data-line-end="${i}"><code class="hljs">${escapeHtml(code)}</code></pre>`;
      }
      result.push(blockHtml);
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      result.push(`<h${level} data-line-end="${lineNum}">${text}</h${level}>`);
      i++;
      continue;
    }

    // Tables
    const tableMatch = line.match(/^\|(.+)\|$/);
    if (tableMatch && i + 1 < lines.length && lines[i + 1].match(/^\|[-:\s|]+\|$/)) {
      const tableLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].match(/^\|.+\|$/)) {
        tableLines.push(lines[i]);
        i++;
      }
      const tableHtml = renderTable(tableLines);
      result.push(`<div data-line-end="${i - 1}">${tableHtml}</div>`);
      continue;
    }

    // Blockquotes
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [line.slice(2)];
      i++;
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      result.push(`<blockquote data-line-end="${i}">${quoteLines.join('<br />')}</blockquote>`);
      continue;
    }

    // Horizontal rules
    if (line.match(/^---+$/)) {
      result.push(`<hr data-line-end="${lineNum}" />`);
      i++;
      continue;
    }

    // List items (unordered)
    if (line.match(/^[-*]\s+/)) {
      const listItems: string[] = [line.replace(/^[-*]\s+/, '')];
      i++;
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        listItems.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      const listHtml = listItems.map(item => `<li>${processInlineElements(item)}</li>`).join('');
      result.push(`<ul data-line-end="${i}">${listHtml}</ul>`);
      continue;
    }

    // List items (ordered)
    if (line.match(/^\d+\.\s+/)) {
      const listItems: string[] = [line.replace(/^\d+\.\s+/, '')];
      i++;
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        listItems.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      const listHtml = listItems.map(item => `<li>${processInlineElements(item)}</li>`).join('');
      result.push(`<ol data-line-end="${i}">${listHtml}</ol>`);
      continue;
    }

    // Paragraph
    if (line.trim()) {
      result.push(`<p data-line-end="${lineNum}">${processInlineElements(line)}</p>`);
    }

    i++;
  }

  return result.join('\n');
}

function processInlineElements(text: string): string {
  let html = text;

  // Code blocks with syntax highlighting
  const codeBlocks: string[] = [];
  html = html.replace(/```([\w]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const language = lang || 'plaintext';
    try {
      const highlighted = hljs.highlight(code.trim(), { language, ignoreIllegals: true }).value;
      const blockHtml = `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
      codeBlocks.push(blockHtml);
      return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    } catch (e) {
      const blockHtml = `<pre><code class="hljs">${escapeHtml(code)}</code></pre>`;
      codeBlocks.push(blockHtml);
      return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    }
  });

  // Tables
  const tables: string[] = [];
  html = html.replace(/^\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+\|\n?)+)/gm, (_match, headerRow, bodyRows) => {
    const parseRow = (row: string) =>
      row
        .trim()
        .split('|')
        .filter((cell) => cell.trim() !== '')
        .map((cell) => cell.trim());

    const headerCells = parseRow(headerRow).map((cell) => `<th>${cell}</th>`).join('');
    const bodyLines = bodyRows.trim().split('\n');
    const bodyCells = bodyLines
      .map((row: string) => {
        const cells = parseRow(row).map((cell) => `<td>${cell}</td>`).join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');

    const tableHtml = `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyCells}</tbody></table>`;
    tables.push(tableHtml);
    return `__TABLE_${tables.length - 1}__`;
  });

  // Escape HTML
  html = escapeHtml(html);

  // Bold / Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; height: auto;" />');

  // Links
  html = html.replace(/\[([^\]]+)]\(([^)]+)\)/g, (_match, text, url) => {
    const isExternal = url.startsWith('http://') || url.startsWith('https://');
    if (isExternal) {
      return `<a href="${url}" rel="noopener noreferrer" target="_blank">${text}</a>`;
    }
    return `<a href="${url}">${text}</a>`;
  });

  // Restore code blocks
  codeBlocks.forEach((codeBlock, idx) => {
    html = html.replace(`__CODE_BLOCK_${idx}__`, codeBlock);
  });

  // Restore tables
  tables.forEach((table, idx) => {
    html = html.replace(`__TABLE_${idx}__`, table);
  });

  return html;
}

function renderTable(tableLines: string[]): string {
  const parseRow = (row: string) =>
    row
      .trim()
      .split('|')
      .filter((cell) => cell.trim() !== '')
      .map((cell) => cell.trim());

  const headerCells = parseRow(tableLines[0]).map((cell) => `<th>${cell}</th>`).join('');
  const bodyCells = tableLines
    .slice(2)
    .map((row) => {
      const cells = parseRow(row).map((cell) => `<td>${cell}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyCells}</tbody></table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// --- Diff view ---

interface DiffViewProps {
  lines: DiffLine[];
}

export function DiffView({ lines }: DiffViewProps) {
  return (
    <div className="diff-view">
      {lines.map((line, i) => (
        <div key={i} className={`diff-line diff-${line.type}`}>
          <span className="diff-marker">
            {line.type === 'insert' ? '+' : line.type === 'delete' ? '-' : ' '}
          </span>
          <span className="diff-content">{line.content}</span>
        </div>
      ))}
    </div>
  );
}
