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

export class ContentsManager {
  constructor(readonly connection: ServerConnection) {}
  async get(path: string, content = true): Promise<ContentsModel> {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const response = await this.connection.request(`/api/contents/${encoded}?content=${content ? '1' : '0'}`);
    return response.json() as Promise<ContentsModel>;
  }
  async save(path: string, notebook: NotebookDocument): Promise<ContentsModel<NotebookDocument>> {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const response = await this.connection.request(`/api/contents/${encoded}`, { method: 'PUT', body: JSON.stringify({ type: 'notebook', format: 'json', content: notebook }) });
    return response.json() as Promise<ContentsModel<NotebookDocument>>;
  }
  async delete(path: string): Promise<void> {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    await this.connection.request(`/api/contents/${encoded}`, { method: 'DELETE' });
  }
  async rename(path: string, newPath: string): Promise<ContentsModel> {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const response = await this.connection.request(`/api/contents/${encoded}`, { method: 'PATCH', body: JSON.stringify({ path: newPath }) });
    return response.json() as Promise<ContentsModel>;
  }
}
