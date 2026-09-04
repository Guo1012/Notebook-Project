import { YNotebook } from '@jupyter/ydoc';
import type { NotebookModel } from '../adapters/docregistry';
type SharedNotebook = YNotebook;
/** Keeps a NotebookModel and a Yjs SharedNotebook synchronized in both directions. */
export declare class NotebookCollaboration {
    readonly model: NotebookModel;
    readonly shared: SharedNotebook;
    private applyingRemote;
    private pushingLocal;
    private readonly localSlot;
    private readonly remoteSlot;
    constructor(model: NotebookModel, shared?: SharedNotebook);
    applyUpdate(update: Uint8Array): void;
    encodeState(): Uint8Array;
    setAwareness(clientId: number, state: unknown): void;
    dispose(): void;
    private pushLocal;
    private applyRemote;
}
export {};
