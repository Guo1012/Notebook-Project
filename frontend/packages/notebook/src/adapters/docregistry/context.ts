import type { ContentsManager } from '../services';
import { Signal } from '@lumino/signaling';
import { NotebookModel } from './model';

export class DocumentContext {
  readonly pathChanged = new Signal<DocumentContext, string>(this);
  readonly saveStateChanged = new Signal<DocumentContext, 'started' | 'completed' | 'failed'>(this);

  constructor(public path: string, readonly model: NotebookModel, readonly contents: ContentsManager) {}

  async save(): Promise<void> {
    this.saveStateChanged.emit('started');
    try {
      await this.contents.save(this.path, this.model.toJSON());
      this.model.dirty = false;
      this.saveStateChanged.emit('completed');
    } catch (error) {
      this.saveStateChanged.emit('failed');
      throw error;
    }
  }

  async revert(): Promise<void> {
    const model = await this.contents.get(this.path);
    if (model.type !== 'notebook') throw new TypeError(`${this.path} is not a notebook`);
    this.model.fromJSON(model.content as import('@lumen/nbformat').NotebookDocument);
  }

  async rename(newPath: string): Promise<void> {
    const renamed = await this.contents.rename(this.path, newPath);
    this.path = renamed.path;
    this.pathChanged.emit(this.path);
  }
}
