import type { NotebookDocument } from '@lumen/nbformat';
import { ServerConnection } from './connection';
export interface ContentsModel<T = unknown> {
    name: string;
    path: string;
    type: 'notebook' | 'file' | 'directory';
    writable: boolean;
    created?: string;
    last_modified?: string;
    content: T;
    format?: string | null;
    mimetype?: string | null;
}
export declare class ContentsManager {
    readonly connection: ServerConnection;
    constructor(connection: ServerConnection);
    get(path: string, content?: boolean): Promise<ContentsModel>;
    save(path: string, notebook: NotebookDocument): Promise<ContentsModel<NotebookDocument>>;
    delete(path: string): Promise<void>;
    rename(path: string, newPath: string): Promise<ContentsModel>;
}
