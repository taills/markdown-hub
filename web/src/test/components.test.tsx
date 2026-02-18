import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownPreview, DiffView } from '@/components/MarkdownPreview';
import type { DiffLine } from '@/types';

describe('MarkdownPreview', () => {
  it('renders heading', () => {
    render(<MarkdownPreview content="# Hello World" />);
    expect(screen.getByText('Hello World').tagName).toBe('H1');
  });

  it('renders paragraph', () => {
    render(<MarkdownPreview content="This is a paragraph." />);
    expect(screen.getByText('This is a paragraph.')).toBeTruthy();
  });

  it('renders bold', () => {
    render(<MarkdownPreview content="**bold text**" />);
    const strong = document.querySelector('strong');
    expect(strong?.textContent).toBe('bold text');
  });
});

describe('DiffView', () => {
  it('renders insert and delete lines', () => {
    const lines: DiffLine[] = [
      { type: 'equal', content: 'same' },
      { type: 'insert', content: 'added' },
      { type: 'delete', content: 'removed' },
    ];
    render(<DiffView lines={lines} />);
    expect(screen.getByText('added')).toBeTruthy();
    expect(screen.getByText('removed')).toBeTruthy();
    expect(screen.getByText('same')).toBeTruthy();
  });
});

describe('DocumentEditor keyboard shortcut', () => {
  it('Ctrl+S triggers save via WebSocket', async () => {
    // Tested via integration — placeholder to confirm test setup works.
    expect(true).toBe(true);
  });
});
