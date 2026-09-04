import type { NotebookModel } from '../adapters/docregistry';
import { LspClient, type Diagnostic, type Position } from '../adapters/lsp';
import { Signal } from '@lumino/signaling';
export interface CellDiagnostic extends Diagnostic {
    cellId: string;
}
export interface LspCompletionItem {
    label: string;
    detail?: string;
    insertText?: string;
    kind?: number;
}
/** Presents code cells as one virtual LSP document and maps positions back to cells. */
export declare class NotebookLspAdapter {
    readonly model: NotebookModel;
    readonly client: LspClient;
    readonly uri: string;
    readonly languageId: string;
    readonly diagnosticsChanged: Signal<NotebookLspAdapter, CellDiagnostic[]>;
    private version;
    private opened;
    private ranges;
    private changeTimer;
    private readonly modelSlot;
    private readonly diagnosticSlot;
    constructor(model: NotebookModel, client: LspClient, uri: string, languageId?: string);
    connect(rootUri?: string): Promise<void>;
    completion(cellId: string, position: Position): Promise<LspCompletionItem[]>;
    hover(cellId: string, position: Position): Promise<unknown>;
    dispose(): void;
    private scheduleChange;
    private virtualDocument;
    private toVirtualPosition;
    private fromVirtualDiagnostic;
}
