import type { ContentsManager } from '../services';
import { Signal } from '@lumino/signaling';
import { NotebookModel } from './model';
export declare class DocumentContext {
    path: string;
    readonly model: NotebookModel;
    readonly contents: ContentsManager;
    readonly pathChanged: Signal<DocumentContext, string>;
    readonly saveStateChanged: Signal<DocumentContext, "started" | "completed" | "failed">;
    constructor(path: string, model: NotebookModel, contents: ContentsManager);
    save(): Promise<void>;
    revert(): Promise<void>;
    rename(newPath: string): Promise<void>;
}
