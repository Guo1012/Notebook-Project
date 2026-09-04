export interface CodeEditorHandle { focus(): void; getValue(): string; setValue(value: string): void }
export interface CompletionRequest { line: number; character: number; prefix: string; explicit: boolean }
export interface CompletionItem { label: string; detail?: string; insertText?: string; type?: string }
export type CompletionProvider = (request: CompletionRequest) => CompletionItem[] | Promise<CompletionItem[]>;
export interface CodeEditorDiagnostic {
  start: { line: number; character: number };
  end: { line: number; character: number };
  message: string;
  severity?: 'error' | 'warning' | 'info';
  source?: string;
}
export interface CodeEditorOptions { value: string; language?: string; readOnly?: boolean; autofocus?: boolean; compact?: boolean; completionProvider?: CompletionProvider; diagnostics?: CodeEditorDiagnostic[] }
