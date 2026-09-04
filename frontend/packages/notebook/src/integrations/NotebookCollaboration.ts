import { YNotebook } from '@jupyter/ydoc';
import type { NotebookModel } from '../adapters/docregistry';
import type { NotebookDocument } from '@lumen/nbformat';
import * as Y from 'yjs';

type SharedNotebook = YNotebook;

/** Keeps a NotebookModel and a Yjs SharedNotebook synchronized in both directions. */
export class NotebookCollaboration {
  private applyingRemote = false;
  private pushingLocal = false;
  private readonly localSlot: () => void;
  private readonly remoteSlot: () => void;

  constructor(readonly model: NotebookModel, readonly shared: SharedNotebook = YNotebook.create()) {
    if (shared.cells.length === 0) this.pushLocal();
    else this.applyRemote();
    this.localSlot = () => {
      if (!this.applyingRemote) this.pushLocal();
    };
    this.remoteSlot = () => {
      if (!this.pushingLocal) this.applyRemote();
    };
    model.contentChanged.connect(this.localSlot);
    shared.changed.connect(this.remoteSlot);
  }

  applyUpdate(update: Uint8Array): void { Y.applyUpdate(this.shared.ydoc, update); }
  encodeState(): Uint8Array { return Y.encodeStateAsUpdate(this.shared.ydoc); }
  setAwareness(clientId: number, state: unknown): void { this.shared.awareness.setLocalStateField(String(clientId), state); }

  dispose(): void {
    this.model.contentChanged.disconnect(this.localSlot);
    this.shared.changed.disconnect(this.remoteSlot);
  }

  private pushLocal(): void {
    this.pushingLocal = true;
    this.shared.fromJSON(this.model.toJSON() as never);
    this.pushingLocal = false;
  }

  private applyRemote(): void {
    this.applyingRemote = true;
    this.model.fromJSON(this.shared.toJSON() as NotebookDocument);
    this.applyingRemote = false;
  }
}
