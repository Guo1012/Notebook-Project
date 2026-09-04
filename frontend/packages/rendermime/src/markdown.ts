import DOMPurify from 'dompurify';
import { marked, type MarkedOptions } from 'marked';

export interface MarkdownParserOptions {
  trusted?: boolean;
  marked?: MarkedOptions;
}

export async function renderMarkdown(source: string, options: MarkdownParserOptions = {}): Promise<string> {
  const html = String(await marked.parse(source, options.marked));
  return options.trusted ? html : DOMPurify.sanitize(html);
}

export function renderMarkdownInline(source: string, options: MarkdownParserOptions = {}): string {
  const html = String(marked.parseInline(source, options.marked));
  return options.trusted ? html : DOMPurify.sanitize(html);
}
