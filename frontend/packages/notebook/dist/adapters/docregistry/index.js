import { NotebookModel } from './model';
export { DocumentContext } from './context';
export { NotebookModel } from './model';
export { DocumentRegistry } from './registry';
export const notebookModelFactory = {
    name: 'notebook',
    contentType: 'notebook',
    fileFormat: 'json',
    createNew: () => NotebookModel.create(),
    createFrom: (value) => new NotebookModel(value)
};
