import type { MimeBundle, NotebookOutput } from '@lumen/nbformat';

// Wire-level nbformat types and kernel status are canonical in the SDK; the app
// re-exports them so `$lib` consumers and @lumen packages share one definition.
export type { JSONValue, MimeBundle, StreamOutput, DisplayOutput, ErrorOutput, NotebookOutput } from '@lumen/nbformat';
export type { NotebookKernelStatus as KernelStatus } from '@lumen/notebook';

export type CellType = 'code' | 'markdown' | 'raw' | 'circuit';
export type CellStatus = 'idle' | 'running' | 'success' | 'error';
export type NotebookMode = 'command' | 'edit';

export interface CircuitData {
  version: 1;
  wires: number;
  gates: Array<{
    id: string;
    type: string;
    wire: number;
    column: number;
    controls?: number[];
  }>;
}

export interface NotebookCell {
  id: string;
  cell_type: CellType;
  metadata: Record<string, unknown>;
  source: string;
  label?: string;
  status: CellStatus;
  isNew?: boolean;
  execution_count?: number | null;
  outputs?: NotebookOutput[];
  circuit?: CircuitData;
  attachments?: Record<string, MimeBundle>;
}

export interface NotebookMetadata extends Record<string, unknown> {
  kernelspec?: {
    display_name: string;
    language: string;
    name: string;
  };
  language_info?: Record<string, unknown>;
}

/** Reactive, view-ready notebook document used by Svelte components. */
export interface Notebook {
  id: string;
  revision: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  nbformat: 4;
  nbformat_minor: number;
  metadata: NotebookMetadata;
  cells: NotebookCell[];
}

/** JSON shape persisted to storage and accepted by NotebookModel.fromJSON(). */
export type NotebookJSON = {
  nbformat: number;
  nbformat_minor: number;
  metadata: NotebookMetadata & {
    lumen?: {
      id?: string;
      title?: string;
      created_at?: string;
      updated_at?: string;
    };
  };
  cells: NotebookCellJSON[];
};

/** A schema-compatible nbformat v4 cell. Circuit cells are encoded as code cells. */
export interface NotebookCellJSON extends Record<string, unknown> {
  id: string;
  cell_type: 'code' | 'markdown' | 'raw';
  metadata: Record<string, unknown>;
  source: string | string[];
  execution_count?: number | null;
  outputs?: NotebookOutput[];
  attachments?: Record<string, MimeBundle>;
}
/** Local nbformat v4 contracts; no JupyterLab frontend package is required. */
export type JupyterNotebookContent = NotebookJSON;
export type JupyterCell = NotebookCellJSON;
export type JupyterOutput = NotebookOutput;
