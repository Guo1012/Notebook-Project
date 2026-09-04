import { CommandRegistry } from '@lumino/commands';
import { NotebookModel } from '../adapters/docregistry';
import type { JSONValue, NormalizedCell } from '@lumen/nbformat';
import type { SessionContext } from '../adapters/services';
import { Signal } from '@lumino/signaling';

export type InsertableCellType = 'code' | 'markdown' | 'raw' | 'circuit';
export type NotebookMode = 'command' | 'edit';

export class NotebookController {
  readonly commands = new CommandRegistry();
  readonly selectionChanged = new Signal<NotebookController, string | null>(this);
  readonly modeChanged = new Signal<NotebookController, NotebookMode>(this);
  readonly runningChanged = new Signal<NotebookController, string | null>(this);
  readonly executionFailed = new Signal<NotebookController, { cellId: string; error: unknown }>(this);
  selectedCellId: string | null;
  selectedIds: string[] = [];
  anchorId = '';
  mode: NotebookMode = 'command';
  runningCellId: string | null = null;
  private clipboard: NormalizedCell[] = [];
  private lastKey = '';
  private lastKeyAt = 0;

  constructor(readonly model: NotebookModel, readonly session?: SessionContext) {
    this.selectedCellId = model.cells.get(0)?.id ?? null;
    this.anchorId = this.selectedCellId ?? '';
    this.registerCommands();
  }

  get selectedCell(): NormalizedCell | undefined {
    return this.selectedCellId ? this.model.getCell(this.selectedCellId) : undefined;
  }

  selectedCells(): NormalizedCell[] {
    const ids = this.selectedIds.length ? this.selectedIds : this.selectedCellId ? [this.selectedCellId] : [];
    return this.model.cells.toArray().filter(cell => ids.includes(cell.id));
  }

  private activeIndex(): number {
    return Math.max(0, this.model.cells.toArray().findIndex(cell => cell.id === this.selectedCellId));
  }

  private setActive(id: string | null): void {
    this.selectedCellId = id;
    this.selectionChanged.emit(id);
  }

  select(id: string | null, event?: MouseEvent): void {
    if (event?.shiftKey && this.anchorId) {
      const cells = this.model.cells.toArray();
      const a = cells.findIndex(cell => cell.id === this.anchorId);
      const b = cells.findIndex(cell => cell.id === id);
      if (a >= 0 && b >= 0) this.selectedIds = cells.slice(Math.min(a, b), Math.max(a, b) + 1).map(cell => cell.id);
    } else {
      this.selectedIds = [];
      if (id) this.anchorId = id;
    }
    this.setActive(id);
    if (event) {
      const target = event.target;
      const isEditTarget = target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && !!target.closest('.cm-editor'));
      if (isEditTarget) this.enterEdit();
      else if (!event.shiftKey) this.enterCommand();
    }
  }

  enterEdit(): void { if (this.mode === 'edit') return; this.mode = 'edit'; this.selectedIds = []; this.modeChanged.emit('edit'); }
  enterCommand(): void { if (this.mode === 'command') return; this.mode = 'command'; this.modeChanged.emit('command'); }

  moveSelection(delta: -1 | 1, extend = false): void {
    const cells = this.model.cells.toArray();
    const target = cells[Math.min(cells.length - 1, Math.max(0, this.activeIndex() + delta))];
    if (!target) return;
    if (extend) {
      if (!this.anchorId) this.anchorId = this.selectedCellId ?? '';
      const a = cells.findIndex(cell => cell.id === this.anchorId);
      const b = cells.findIndex(cell => cell.id === target.id);
      this.selectedIds = cells.slice(Math.min(a, b), Math.max(a, b) + 1).map(cell => cell.id);
    } else {
      this.selectedIds = [];
    }
    this.setActive(target.id);
  }

  insert(type: InsertableCellType, belowId = this.selectedCellId, position: 'before' | 'after' = 'after'): NormalizedCell {
    const cells = this.model.cells.toArray();
    const base = belowId ? cells.findIndex(cell => cell.id === belowId) : cells.length - 1;
    const index = position === 'before' ? Math.max(0, base) : base + 1;
    const cell = this.model.insertCell(Math.max(0, index), type);
    this.selectedIds = [];
    this.select(cell.id);
    return cell;
  }

  moveCell(id: string, offset: -1 | 1): boolean {
    const from = this.model.cells.toArray().findIndex(cell => cell.id === id);
    if (from < 0) return false;
    return this.model.moveCell(id, from + offset);
  }

  moveSelected(offset: -1 | 1): boolean {
    return this.selectedCellId ? this.moveCell(this.selectedCellId, offset) : false;
  }

  duplicateCell(id: string): void {
    const cells = this.model.cells.toArray();
    const index = cells.findIndex(cell => cell.id === id);
    if (index < 0) return;
    this.model.insertCellValue(index + 1, cells[index]);
    this.selectedIds = [];
    this.select(this.model.cells.get(index + 1)?.id ?? null);
  }

  deleteCell(id: string): boolean {
    const cells = this.model.cells.toArray();
    if (cells.length <= 1) return false;
    const index = cells.findIndex(cell => cell.id === id);
    if (index < 0) return false;
    this.model.deleteCell(id);
    this.selectedIds = [];
    this.select(this.model.cells.get(Math.min(index, this.model.cells.length - 1))?.id ?? null);
    return true;
  }

  deleteSelected(): boolean {
    const cells = this.model.cells.toArray();
    const targets = this.selectedCells();
    if (!targets.length || targets.length >= cells.length) return false;
    const firstIndex = cells.findIndex(cell => cell.id === targets[0].id);
    for (const target of targets) this.model.deleteCell(target.id);
    this.selectedIds = [];
    this.select(this.model.cells.get(Math.min(firstIndex, this.model.cells.length - 1))?.id ?? null);
    return true;
  }

  copySelected(): void { this.clipboard = this.selectedCells().map(cell => structuredClone(cell)); }

  cutSelected(): void { this.copySelected(); this.deleteSelected(); }

  cutCell(id: string): void {
    const cell = this.model.getCell(id);
    if (!cell) return;
    this.clipboard = [structuredClone(cell)];
    this.deleteCell(id);
  }

  pasteBelow(): void {
    if (!this.clipboard.length) return;
    const cells = this.model.cells.toArray();
    const current = this.selectedCellId ? cells.findIndex(cell => cell.id === this.selectedCellId) : cells.length - 1;
    this.clipboard.forEach((cell, offset) => this.model.insertCellValue(current + 1 + offset, cell));
    this.selectedIds = [];
    this.select(this.model.cells.get(current + this.clipboard.length)?.id ?? this.selectedCellId);
  }

  changeSelectedType(type: InsertableCellType): void {
    for (const cell of this.selectedCells()) this.model.changeCellType(cell.id, type);
  }

  async runSelected(): Promise<void> {
    const cell = this.selectedCell;
    if (cell) await this.runCell(cell.id);
  }

  async runCell(id: string): Promise<void> {
    const cell = this.model.getCell(id);
    if (!cell) return;
    if (cell.lumenType === 'circuit') {
      this.model.updateOutputs(id, [{
        output_type: 'display_data',
        data: {
          'text/plain': '电路编辑器连接点已保留，运行服务将在后续版本接入。',
          'application/vnd.lumen.circuit+json': (cell.circuit ?? { version: 1, wires: 2, gates: [] }) as unknown as JSONValue
        },
        metadata: {}
      }]);
      return;
    }
    if (cell.cell_type !== 'code' || !this.session) return;
    this.runningCellId = id;
    this.runningChanged.emit(id);
    try {
      const result = await this.session.execute(cell);
      this.model.updateExecutionCount(id, result.executionCount);
      this.model.updateOutputs(id, result.outputs);
    } catch (error) {
      this.executionFailed.emit({ cellId: id, error });
      throw error;
    } finally {
      this.runningCellId = null;
      this.runningChanged.emit(null);
    }
  }

  async runAll(): Promise<void> {
    for (const cell of this.model.cells.toArray()) await this.runCell(cell.id);
  }

  clearOutputs(id: string): void {
    this.model.updateOutputs(id, []);
  }

  handleKeydown(event: KeyboardEvent): void {
    const cell = this.selectedCell;
    if (!cell) return;
    const target = event.target as HTMLElement;

    if (this.mode === 'edit') {
      if (event.key === 'Escape') { event.preventDefault(); target.blur?.(); this.enterCommand(); }
      else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void this.runCell(cell.id); }
      else if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault();
        void this.runCell(cell.id);
        const next = this.model.cells.get(this.activeIndex() + 1);
        if (next) this.select(next.id); else this.insert('code', cell.id);
        this.enterCommand();
      } else if (event.key === 'Enter' && event.altKey) {
        event.preventDefault();
        void this.runCell(cell.id);
        this.insert('code', cell.id);
        this.enterEdit();
      }
      return;
    }

    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) {
      event.preventDefault();
      void this.runCell(cell.id);
      if (event.shiftKey) this.moveSelection(1);
      else if (event.altKey) this.insert('code', cell.id);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    const now = Date.now();
    if (key === 'Enter') { event.preventDefault(); this.enterEdit(); }
    else if (key === 'ArrowUp' || key === 'k') { event.preventDefault(); this.moveSelection(-1, event.shiftKey); }
    else if (key === 'ArrowDown' || key === 'j') { event.preventDefault(); this.moveSelection(1, event.shiftKey); }
    else if (key === 'a') { event.preventDefault(); this.insert('code', cell.id, 'before'); }
    else if (key === 'b') { event.preventDefault(); this.insert('code', cell.id, 'after'); }
    else if (key === 'm') { event.preventDefault(); this.changeSelectedType('markdown'); }
    else if (key === 'y') { event.preventDefault(); this.changeSelectedType('code'); }
    else if (key === 'c') { event.preventDefault(); this.copySelected(); }
    else if (key === 'x') { event.preventDefault(); this.cutSelected(); }
    else if (key === 'v') { event.preventDefault(); this.pasteBelow(); }
    else if (key === 'z') { event.preventDefault(); this.model.undo(); }
    else if (key === 'Z') { event.preventDefault(); this.model.redo(); }
    else if (/^[1-6]$/.test(key)) {
      event.preventDefault();
      const level = Number(key);
      for (const item of this.selectedCells()) {
        this.model.changeCellType(item.id, 'markdown');
        if (!/^#{1,6}\s/.test(item.source)) this.model.updateSource(item.id, `${'#'.repeat(level)} ${item.source}`);
      }
    }
    else if (key === 'd' && this.lastKey === 'd' && now - this.lastKeyAt < 700) {
      event.preventDefault();
      this.deleteSelected();
      this.lastKey = '';
    }
    else { this.lastKey = key; this.lastKeyAt = now; }
  }

  private registerCommands(): void {
    this.commands.addCommand('notebook:run-cell', { label: 'Run Cell', isEnabled: () => Boolean(this.session && this.selectedCell), execute: () => this.runSelected() });
    this.commands.addCommand('notebook:run-all', { label: 'Run All Cells', isEnabled: () => Boolean(this.session), execute: () => this.runAll() });
    this.commands.addCommand('notebook:insert-code-below', { label: 'Insert Code Cell Below', execute: () => this.insert('code') });
    this.commands.addCommand('notebook:insert-markdown-below', { label: 'Insert Markdown Cell Below', execute: () => this.insert('markdown') });
    this.commands.addCommand('notebook:delete-cell', { label: 'Delete Cell', isEnabled: () => this.model.cells.length > 1, execute: () => this.deleteSelected() });
    this.commands.addCommand('notebook:move-cell-up', { label: 'Move Cell Up', execute: () => this.moveSelected(-1) });
    this.commands.addCommand('notebook:move-cell-down', { label: 'Move Cell Down', execute: () => this.moveSelected(1) });
    this.commands.addCommand('notebook:undo', { label: 'Undo', isEnabled: () => this.model.canUndo, execute: () => this.model.undo() });
    this.commands.addCommand('notebook:redo', { label: 'Redo', isEnabled: () => this.model.canRedo, execute: () => this.model.redo() });
    this.commands.addCommand('notebook:copy-cell', { label: 'Copy Cell', execute: () => this.copySelected() });
    this.commands.addCommand('notebook:cut-cell', { label: 'Cut Cell', execute: () => this.cutSelected() });
    this.commands.addCommand('notebook:paste-cell-below', { label: 'Paste Cell Below', execute: () => this.pasteBelow() });
    this.commands.addCommand('notebook:duplicate-cell', { label: 'Duplicate Cell', execute: () => this.selectedCellId ? this.duplicateCell(this.selectedCellId) : undefined });
  }
}
