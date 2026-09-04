import type * as nbformat from '@jupyterlab/nbformat';
import type { JSONValue } from '@lumino/coreutils';

export type { JSONValue };
export type JupyterMimeBundle = nbformat.IMimeBundle;
export type JupyterNotebookOutput = nbformat.IOutput;
export type JupyterNotebookCell = nbformat.ICell;
export type JupyterNotebookDocument = nbformat.INotebookContent;
export type MultilineString = nbformat.MultilineString;
export type CellType = nbformat.CellType;
export type ExecutionCount = nbformat.ExecutionCount;

export type MimeBundle = Record<string, JSONValue | string | string[] | undefined>;
export interface StreamOutput { output_type: 'stream'; name: 'stdout' | 'stderr'; text: string | string[] }
export interface ErrorOutput { output_type: 'error'; ename: string; evalue: string; traceback: string[] }
export interface DisplayOutput { output_type: 'display_data' | 'execute_result' | 'update_display_data'; data: MimeBundle; metadata?: Record<string, unknown>; execution_count?: number | null; transient?: Record<string, JSONValue> }
export type NotebookOutput = StreamOutput | ErrorOutput | DisplayOutput;
export interface NotebookCell { id?: string; cell_type: 'code' | 'markdown' | 'raw'; source: string | string[]; metadata?: Record<string, unknown>; execution_count?: number | null; outputs?: NotebookOutput[]; attachments?: Record<string, MimeBundle> }
export interface NotebookDocument { nbformat: number; nbformat_minor: number; metadata?: Record<string, unknown>; cells: NotebookCell[] }

export interface CircuitGate { id?: string; type: string; wire: number; column: number; controls?: number[] }
export interface CircuitData { version?: number; wires: number; gates: CircuitGate[] }
export interface NormalizedCell extends Omit<NotebookCell, 'id' | 'source' | 'metadata'> { id: string; source: string; metadata: Record<string, unknown>; lumenType?: 'circuit'; circuit?: CircuitData }
export interface NormalizedNotebook extends Omit<NotebookDocument, 'cells' | 'metadata'> { metadata: Record<string, unknown>; cells: NormalizedCell[] }

const record = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
const sourceToString = (value: unknown) => Array.isArray(value) ? value.map(String).join('') : String(value ?? '');

export function parseNotebook(value: NotebookDocument | string): NormalizedNotebook {
  const input = typeof value === 'string' ? JSON.parse(value) as NotebookDocument : value;
  if (!input || !Array.isArray(input.cells)) throw new TypeError('Invalid .ipynb document: cells must be an array');
  return {
    nbformat: Number(input.nbformat || 4), nbformat_minor: Number(input.nbformat_minor || 0), metadata: record(input.metadata),
    cells: input.cells.map((cell, index): NormalizedCell => {
      const metadata = record(cell.metadata); const lumen = record(metadata.lumen); const isCircuit = lumen.cell_type === 'circuit';
      return { ...cell, id: cell.id || `cell-${index}`, source: sourceToString(cell.source), metadata,
        ...(isCircuit ? { lumenType: 'circuit' as const, circuit: record(lumen.circuit) as unknown as CircuitData } : {}) };
    })
  };
}
