import type { nbformat } from '@jupyterlab/nbformat'

export interface NotebookDocumentState {
  notebookId: string
  revision: number
  content: nbformat.INotebookContent
  dirty: boolean
}

export interface NotebookResponse {
  notebookId: string
  revision: number
  content: nbformat.INotebookContent
}