import { type NormalizedCell, type NormalizedNotebook, type NotebookDocument, type NotebookOutput } from '@lumen/nbformat';
import { ObservableList, type IObservableList } from '@jupyterlab/observables';
import { Signal } from '@lumino/signaling';
export type ListChange<T> = IObservableList.IChangedArgs<T>;
export declare class NotebookCellList<T> extends ObservableList<T> {
    toArray(): T[];
    reset(values: Iterable<T>): void;
}
export type NotebookChange = {
    type: 'cells';
    change: ListChange<NormalizedCell>;
} | {
    type: 'cell';
    cellId: string;
    field: 'source' | 'outputs' | 'execution_count' | 'metadata';
} | {
    type: 'metadata';
} | {
    type: 'reset';
};
export declare class NotebookModel {
    readonly cells: NotebookCellList<NormalizedCell>;
    readonly contentChanged: Signal<NotebookModel, NotebookChange>;
    readonly dirtyChanged: Signal<NotebookModel, boolean>;
    readonly historyChanged: Signal<NotebookModel, {
        canUndo: boolean;
        canRedo: boolean;
    }>;
    nbformat: number;
    nbformatMinor: number;
    metadata: Record<string, unknown>;
    private _dirty;
    private suppressListChange;
    private undoStack;
    private redoStack;
    constructor(value: NotebookDocument | string);
    static create(): NotebookModel;
    get dirty(): boolean;
    set dirty(value: boolean);
    getCell(id: string): NormalizedCell | undefined;
    insertCell(index: number, type: 'code' | 'markdown' | 'raw' | 'circuit', source?: string): NormalizedCell;
    deleteCell(id: string): boolean;
    moveCell(id: string, to: number): boolean;
    updateSource(id: string, source: string): void;
    updateOutputs(id: string, outputs: NotebookOutput[]): void;
    updateExecutionCount(id: string, count: number | null): void;
    setMetadata(metadata: Record<string, unknown>): void;
    fromJSON(value: NotebookDocument | string): void;
    get canUndo(): boolean;
    get canRedo(): boolean;
    undo(): boolean;
    redo(): boolean;
    insertCellValue(index: number, cell: NormalizedCell): void;
    changeCellType(id: string, type: 'code' | 'markdown' | 'raw' | 'circuit'): void;
    private applyDocument;
    toJSON(): NotebookDocument;
    snapshot(): NormalizedNotebook;
    toString(space?: number): string;
    private updateCell;
    private markChanged;
    private recordHistory;
    private emitHistory;
}
