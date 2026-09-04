import { parseNotebook } from '@lumen/nbformat';
import { ObservableList } from '@jupyterlab/observables';
import { Signal } from '@lumino/signaling';
export class NotebookCellList extends ObservableList {
    toArray() { return Array.from(this); }
    reset(values) {
        this.clear();
        this.pushAll(values);
    }
}
export class NotebookModel {
    cells;
    contentChanged = new Signal(this);
    dirtyChanged = new Signal(this);
    historyChanged = new Signal(this);
    nbformat;
    nbformatMinor;
    metadata;
    _dirty = false;
    suppressListChange = false;
    undoStack = [];
    redoStack = [];
    constructor(value) {
        const document = parseNotebook(value);
        this.nbformat = document.nbformat;
        this.nbformatMinor = document.nbformat_minor;
        this.metadata = clone(document.metadata);
        this.cells = new NotebookCellList({ values: document.cells.map(clone) });
        this.cells.changed.connect((_sender, change) => {
            if (this.suppressListChange)
                return;
            this.markChanged({ type: 'cells', change });
        });
    }
    static create() {
        return new NotebookModel({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells: [createCell('code')] });
    }
    get dirty() { return this._dirty; }
    set dirty(value) {
        if (value === this._dirty)
            return;
        this._dirty = value;
        this.dirtyChanged.emit(value);
    }
    getCell(id) { return this.cells.toArray().find(cell => cell.id === id); }
    insertCell(index, type, source = '') {
        this.recordHistory();
        const cell = createCell(type, source);
        this.cells.insert(index, cell);
        return cell;
    }
    deleteCell(id) {
        const index = this.cells.toArray().findIndex(cell => cell.id === id);
        if (index < 0)
            return false;
        this.recordHistory();
        this.cells.remove(index);
        return true;
    }
    moveCell(id, to) {
        const from = this.cells.toArray().findIndex(cell => cell.id === id);
        if (from < 0 || to < 0 || to >= this.cells.length)
            return false;
        this.recordHistory();
        this.cells.move(from, to);
        return true;
    }
    updateSource(id, source) { this.updateCell(id, 'source', source); }
    updateOutputs(id, outputs) { this.updateCell(id, 'outputs', clone(outputs)); }
    updateExecutionCount(id, count) { this.updateCell(id, 'execution_count', count); }
    setMetadata(metadata) {
        this.recordHistory();
        this.metadata = clone(metadata);
        this.markChanged({ type: 'metadata' });
    }
    fromJSON(value) {
        const document = parseNotebook(value);
        this.applyDocument(document, false);
        this.undoStack = [];
        this.redoStack = [];
        this.emitHistory();
    }
    get canUndo() { return this.undoStack.length > 0; }
    get canRedo() { return this.redoStack.length > 0; }
    undo() {
        const previous = this.undoStack.pop();
        if (!previous)
            return false;
        this.redoStack.push(this.toJSON());
        this.applyDocument(parseNotebook(previous), true);
        this.emitHistory();
        return true;
    }
    redo() {
        const next = this.redoStack.pop();
        if (!next)
            return false;
        this.undoStack.push(this.toJSON());
        this.applyDocument(parseNotebook(next), true);
        this.emitHistory();
        return true;
    }
    insertCellValue(index, cell) {
        this.recordHistory();
        this.cells.insert(index, { ...clone(cell), id: `cell-${crypto.randomUUID()}` });
    }
    changeCellType(id, type) {
        const index = this.cells.toArray().findIndex(cell => cell.id === id);
        const cell = this.cells.get(index);
        if (!cell)
            return;
        this.recordHistory();
        const next = createCell(type, cell.source);
        next.id = cell.id;
        next.metadata = clone(cell.metadata);
        this.cells.set(index, next);
    }
    applyDocument(document, dirty) {
        this.nbformat = document.nbformat;
        this.nbformatMinor = document.nbformat_minor;
        this.metadata = clone(document.metadata);
        this.suppressListChange = true;
        this.cells.reset(document.cells.map(clone));
        this.suppressListChange = false;
        this.dirty = dirty;
        this.contentChanged.emit({ type: 'reset' });
    }
    toJSON() {
        return {
            nbformat: this.nbformat,
            nbformat_minor: this.nbformatMinor,
            metadata: clone(this.metadata),
            cells: this.cells.toArray().map(cell => {
                const metadata = clone(cell.metadata);
                if (cell.lumenType === 'circuit')
                    metadata.lumen = { ...asRecord(metadata.lumen), cell_type: 'circuit', circuit: clone(cell.circuit ?? { wires: 2, gates: [] }) };
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
    snapshot() {
        return parseNotebook(this.toJSON());
    }
    toString(space = 2) { return JSON.stringify(this.toJSON(), null, space); }
    updateCell(id, field, value) {
        const index = this.cells.toArray().findIndex(cell => cell.id === id);
        const cell = this.cells.get(index);
        if (!cell)
            throw new Error(`Unknown cell: ${id}`);
        if (cell[field] === value)
            return;
        this.recordHistory();
        this.suppressListChange = true;
        this.cells.set(index, { ...cell, [field]: value });
        this.suppressListChange = false;
        this.markChanged({ type: 'cell', cellId: id, field });
    }
    markChanged(change) {
        this.dirty = true;
        this.contentChanged.emit(change);
    }
    recordHistory() {
        this.undoStack.push(this.toJSON());
        if (this.undoStack.length > 100)
            this.undoStack.shift();
        this.redoStack = [];
        this.emitHistory();
    }
    emitHistory() { this.historyChanged.emit({ canUndo: this.canUndo, canRedo: this.canRedo }); }
}
function createCell(type, source = '') {
    return {
        id: `cell-${crypto.randomUUID()}`,
        cell_type: type === 'circuit' ? 'code' : type,
        source,
        metadata: type === 'circuit' ? { lumen: { cell_type: 'circuit' } } : {},
        ...(type === 'code' || type === 'circuit' ? { execution_count: null, outputs: [] } : {}),
        ...(type === 'circuit' ? { lumenType: 'circuit', circuit: { version: 1, wires: 2, gates: [] } } : {})
    };
}
const asRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
const clone = (value) => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
