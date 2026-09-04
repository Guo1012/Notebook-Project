import { apiFetch } from './api/client';
import { NotebookModel } from './notebookModel';
import type { CellType, Notebook, NotebookCell, NotebookJSON } from './types';

interface NotebookResponse {
  notebookId: string; title: string; revision: number; content: NotebookJSON;
  createdAt: string; updatedAt: string;
}

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createCell(type: CellType, empty = false): NotebookCell {
  return NotebookModel.createCell(type, empty);
}

export function createNotebook(title = '未命名 Notebook'): Notebook {
  const now = new Date().toISOString();
  const notebook = NotebookModel.fromJSON({
    nbformat: 4, nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      language_info: { name: 'python', version: '3' },
      lumen: { id: uid('notebook'), title, created_at: now, updated_at: now }
    },
    cells: [NotebookModel.createCell('markdown'), NotebookModel.createCell('code'), NotebookModel.createCell('circuit')]
  });
  notebook.revision = 0;
  return notebook;
}

function fromResponse(value: NotebookResponse): Notebook {
  const notebook = NotebookModel.fromJSON(value.content);
  notebook.id = value.notebookId;
  notebook.title = value.title;
  notebook.revision = value.revision;
  notebook.createdAt = value.createdAt;
  notebook.updatedAt = value.updatedAt;
  return notebook;
}

export async function getNotebooks(): Promise<Notebook[]> {
  const list = await (await apiFetch('/api/notebooks')).json() as { items: Array<{ notebookId: string }> };
  return Promise.all(list.items.map(item => getNotebook(item.notebookId))).then(items => items.filter((item): item is Notebook => item !== null));
}

export async function saveNotebook(notebook: Notebook): Promise<Notebook> {
  const creating = notebook.revision === 0;
  const response = await apiFetch(creating ? '/api/notebooks' : `/api/notebooks/${encodeURIComponent(notebook.id)}`, {
    method: creating ? 'POST' : 'PUT',
    body: JSON.stringify(creating
      ? { title: notebook.title, content: NotebookModel.toJSON(notebook) }
      : { baseRevision: notebook.revision, title: notebook.title, content: NotebookModel.toJSON(notebook) })
  });
  return fromResponse(await response.json());
}

export async function getNotebook(id: string): Promise<Notebook | null> {
  try { return fromResponse(await (await apiFetch(`/api/notebooks/${encodeURIComponent(id)}`)).json()); }
  catch (error) {
    if (typeof error === 'object' && error && 'status' in error && error.status === 404) return null;
    throw error;
  }
}

export async function deleteNotebook(id: string): Promise<void> {
  await apiFetch(`/api/notebooks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function renameNotebook(id: string, title: string): Promise<Notebook> {
  const response = await apiFetch(`/api/notebooks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title: title.trim() || '未命名 Notebook' }) });
  return fromResponse(await response.json());
}

export async function duplicateNotebook(id: string): Promise<Notebook | null> {
  const source = await getNotebook(id);
  if (!source) return null;
  const copy = NotebookModel.fromJSON(NotebookModel.toJSON(source));
  copy.id = uid('notebook'); copy.revision = 0; copy.title = `${source.title} 副本`;
  copy.createdAt = new Date().toISOString(); copy.updatedAt = copy.createdAt;
  copy.cells = copy.cells.map(cell => ({ ...cell, id: uid('cell') }));
  return saveNotebook(copy);
}

export function cellLabel(cell: NotebookCell, index: number) {
  if (cell.label?.trim()) return cell.label.trim();
  if (cell.cell_type === 'circuit') return `电路 ${index + 1}`;
  const first = cell.source.split('\n').find(line => line.trim())?.replace(/^#+\s*/, '').trim();
  const fallback = cell.cell_type === 'code' ? '代码' : cell.cell_type === 'raw' ? '原始文本' : 'Markdown';
  return first || `${fallback} ${index + 1}`;
}

export function exportNotebook(notebook: Notebook): NotebookJSON { return NotebookModel.toJSON(notebook); }

export function importNotebook(source: string, filename = 'notebook.ipynb'): Notebook {
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error('文件不是有效的 JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('文件内容不是 Notebook 对象');
  const json = value as Record<string, unknown>;
  if (json.nbformat !== 4) throw new Error(`仅支持 nbformat 4，当前为 ${String(json.nbformat ?? '未知')}`);
  if (!Array.isArray(json.cells)) throw new Error('Notebook 缺少 cells 数组');
  const imported = NotebookModel.fromJSON(value);
  const now = new Date().toISOString();
  const lumen = json.metadata && typeof json.metadata === 'object' ? (json.metadata as Record<string, unknown>).lumen : undefined;
  imported.id = uid('notebook'); imported.revision = 0;
  imported.title = lumen && typeof lumen === 'object' && typeof (lumen as Record<string, unknown>).title === 'string' ? imported.title : filename.replace(/\.ipynb$/i, '').trim() || '未命名 Notebook';
  imported.createdAt = now; imported.updatedAt = now;
  const usedIds = new Set<string>();
  imported.cells = imported.cells.map(cell => {
    let id = cell.id;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || usedIds.has(id)) id = uid('cell');
    usedIds.add(id); return { ...cell, id, status: 'idle', isNew: false };
  });
  return imported;
}

export function notebookDownloadName(notebook: Notebook): string {
  const safe = notebook.title.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\.+$/g, '').slice(0, 120);
  return `${safe || 'notebook'}.ipynb`;
}
