import { NotebookModel } from './model';
export { DocumentContext } from './context';
export { NotebookModel } from './model';
export type { NotebookChange } from './model';
export { DocumentRegistry } from './registry';
export type { ModelFactory } from './registry';
export declare const notebookModelFactory: {
    name: string;
    contentType: string;
    fileFormat: "json";
    createNew: () => NotebookModel;
    createFrom: (value: unknown) => NotebookModel;
};
