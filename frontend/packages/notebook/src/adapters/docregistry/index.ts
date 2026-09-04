import type { NotebookDocument } from '@lumen/nbformat';
import { NotebookModel } from './model';

export { DocumentContext } from './context';
export { NotebookModel } from './model';
export type { NotebookChange } from './model';
export { DocumentRegistry } from './registry';
export type { ModelFactory } from './registry';

export const notebookModelFactory = {
  name: 'notebook',
  contentType: 'notebook',
  fileFormat: 'json' as const,
  createNew: () => NotebookModel.create(),
  createFrom: (value: unknown) => new NotebookModel(value as NotebookDocument)
};
