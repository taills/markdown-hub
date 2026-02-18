import type { LinePatch } from '@/types';

const splitLines = (content: string): string[] => content.split('\n');

export function createLinePatch(oldContent: string, newContent: string): LinePatch | null {
  if (oldContent === newContent) return null;

  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);

  let start = 0;
  while (start < oldLines.length && start < newLines.length) {
    if (oldLines[start] !== newLines[start]) break;
    start++;
  }

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= start && newEnd >= start) {
    if (oldLines[oldEnd] !== newLines[newEnd]) break;
    oldEnd--;
    newEnd--;
  }

  const deleteCount = oldEnd >= start ? oldEnd - start + 1 : 0;
  const insertLines = newLines.slice(start, newEnd + 1);

  return {
    start_line: start,
    delete_count: deleteCount,
    insert_lines: insertLines,
  };
}

export function applyLinePatch(content: string, patch: LinePatch): string {
  const lines = splitLines(content);
  if (patch.start_line < 0 || patch.start_line > lines.length) return content;
  if (patch.delete_count < 0) return content;

  const end = patch.start_line + patch.delete_count;
  if (end > lines.length) return content;

  const updated = [
    ...lines.slice(0, patch.start_line),
    ...patch.insert_lines,
    ...lines.slice(end),
  ];

  return updated.join('\n');
}
