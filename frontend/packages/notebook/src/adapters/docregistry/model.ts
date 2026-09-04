import { parseNotebook, type NormalizedCell, type NormalizedNotebook, type NotebookDocument, type NotebookOutput } from '@lumen/nbformat';
import { ObservableList, type IObservableList } from '@jupyterlab/observables';
import { Signal } from '@lumino/signaling';

export type ListChange<T> = IObservableList.IChangedArgs<T>;
export class NotebookCellList<T> extends ObservableList<T> {
  toArray(): T[] { return Array.from(this); }
  reset(values: Iterable<T>): void {
    this.clear();
    this.pushAll(values);
  }
}

export type NotebookChange =
  | { type: 'cells'; change: ListChange<NormalizedCell> }
  | { type: 'cell'; cellId: string; field: 'source' | 'outputs' | 'execution_count' | 'metadata' }
  | { type: 'metadata' }
  | { type: 'reset' };

export class NotebookModel {
  readonly cells: NotebookCellList<NormalizedCell>;
  readonly contentChanged = new Signal<NotebookModel, NotebookChange>(this);
  readonly dirtyChanged = new Signal<NotebookModel, boolean>(this);
  readonly historyChanged = new Signal<NotebookModel, { canUndo: boolean; canRedo: boolean }>(this);
  nbformat: number;
  nbformatMinor: number;
  metadata: Record<string, unknown>;
  private _dirty = false;
  private suppressListChange = false;
  private undoStack: NotebookDocument[] = [];
  private redoStack: NotebookDocument[] = [];

  constructor(value: NotebookDocument | string) {
    const document = parseNotebook(value);
    this.nbformat = document.nbformat;
    this.nbformatMinor = document.nbformat_minor;
    this.metadata = clone(document.metadata);
    this.cells = new NotebookCellList({ values: document.cells.map(clone) });
    this.cells.changed.connect((_sender, change) => {
      if (this.suppressListChange) return;
      this.markChanged({ type: 'cells', change });
    });
  }

  static create(): NotebookModel {
    return new NotebookModel({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells: [createCell('code')] });
  }

  get dirty(): boolean { return this._dirty; }
  set dirty(value: boolean) {
    if (value === this._dirty) return;
    this._dirty = value;
    this.dirtyChanged.emit(value);
  }

  getCell(id: string): NormalizedCell | undefined { return this.cells.toArray().find(cell => cell.id === id); }

  insertCell(index: number, type: 'code' | 'markdown' | 'raw' | 'circuit', source = ''): NormalizedCell {
    this.recordHistory();
    const cell = createCell(type, source);
    this.cells.insert(index, cell);
    return cell;
  }

  deleteCell(id: string): boolean {
    const index = this.cells.toArray().findIndex(cell => cell.id === id);
    if (index < 0) return false;
    this.recordHistory();
    this.cells.remove(index);
    return true;
  }

  moveCell(id: string, to: number): boolean {
    const from = this.cells.toArray().findIndex(cell => cell.id === id);
    if (from < 0 || to < 0 || to >= this.cells.length) return false;
    this.recordHistory();
    this.cells.move(from, to);
    return true;
  }

  updateSource(id: string, source: string): void { this.updateCell(id, 'source', source); }
  updateOutputs(id: string, outputs: NotebookOutput[]): void { this.updateCell(id, 'outputs', clone(outputs)); }
  updateExecutionCount(id: string, count: number | null): void { this.updateCell(id, 'execution_count', count); }

  setMetadata(metadata: Record<string, unknown>): void {
    this.recordHistory();
    this.metadata = clone(metadata);
    this.markChanged({ type: 'metadata' });
  }

  fromJSON(value: NotebookDocument | string): void {
    const document = parseNotebook(value);
    this.applyDocument(document, false);
    this.undoStack = [];
    this.redoStack = [];
    this.emitHistory();
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  undo(): boolean {
    const previous = this.undoStack.pop();
    if (!previous) return false;
    this.redoStack.push(this.toJSON());
    this.applyDocument(parseNotebook(previous), true);
    this.emitHistory();
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.toJSON());
    this.applyDocument(parseNotebook(next), true);
    this.emitHistory();
    return true;
  }

  insertCellValue(index: number, cell: NormalizedCell): void {
    this.recordHistory();
    this.cells.insert(index, { ...clone(cell), id: `cell-${crypto.randomUUID()}` });
  }

  changeCellType(id: string, type: 'code' | 'markdown' | 'raw' | 'circuit'): void {
    const index = this.cells.toArray().findIndex(cell => cell.id === id);
    const cell = this.cells.get(index);
    if (!cell) return;
    this.recordHistory();
    const next = createCell(type, cell.source);
    next.id = cell.id;
    next.metadata = clone(cell.metadata);
    this.cells.set(index, next);
  }

  private applyDocument(document: NormalizedNotebook, dirty: boolean): void {
    this.nbformat = document.nbformat;
    this.nbformatMinor = document.nbformat_minor;
    this.metadata = clone(document.metadata);
    this.suppressListChange = true;
    this.cells.reset(document.cells.map(clone));
    this.suppressListChange = false;
    this.dirty = dirty;
    this.contentChanged.emit({ type: 'reset' });
  }

  toJSON(): NotebookDocument {
    return {
      nbformat: this.nbformat,
      nbformat_minor: this.nbformatMinor,
      metadata: clone(this.metadata),
      cells: this.cells.toArray().map(cell => {
        const metadata = clone(cell.metadata);
        if (cell.lumenType === 'circuit') metadata.lumen = { ...asRecord(metadata.lumen), cell_type: 'circuit', circuit: clone(cell.circuit ?? { wires: 2, gates: [] }) };
        return {
          id: cell.id,
          cell_type: cell.lumenType === 'circuit' ? 'code' : cell.cell_type,
          source: cell.source,
          metadata,
          ...(cell.cell_type === 'code' ? { execution_count: cell.execution_count ?? null, outputs: clone(cell.outputs ?? []) } : {}),
          ...(cell.attachments ? { attachments: clone(cell.attachments) } : {})
        };
      })
    };
  }

  snapshot(): NormalizedNotebook {
    return parseNotebook(this.toJSON());
  }

  toString(space = 2): string { return JSON.stringify(this.toJSON(), null, space); }

  private updateCell<K extends 'source' | 'outputs' | 'execution_count'>(id: string, field: K, value: NormalizedCell[K]): void {
    const index = this.cells.toArray().findIndex(cell => cell.id === id);
    const cell = this.cells.get(index);
    if (!cell) throw new Error(`Unknown cell: ${id}`);
    if (cell[field] === value) return;
    this.recordHistory();
    this.suppressListChange = true;
    this.cells.set(index, { ...cell, [field]: value });
    this.suppressListChange = false;
    this.markChanged({ type: 'cell', cellId: id, field });
  }

  private markChanged(change: NotebookChange): void {
    this.dirty = true;
    this.contentChanged.emit(change);
  }

  private recordHistory(): void {
    this.undoStack.push(this.toJSON());
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.emitHistory();
  }

  private emitHistory(): void { this.historyChanged.emit({ canUndo: this.canUndo, canRedo: this.canRedo }); }
}

function createCell(type: 'code' | 'markdown' | 'raw' | 'circuit', source = ''): NormalizedCell {
  return {
    id: `cell-${crypto.randomUUID()}`,
    cell_type: type === 'circuit' ? 'code' : type,
    source,
    metadata: type === 'circuit' ? { lumen: { cell_type: 'circuit' } } : {},
    ...(type === 'code' || type === 'circuit' ? { execution_count: null, outputs: [] } : {}),
    ...(type === 'circuit' ? { lumenType: 'circuit' as const, circuit: { version: 1, wires: 2, gates: [] } } : {})
  };
}

const asRecord = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
const clone = <T>(value: T): T => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
