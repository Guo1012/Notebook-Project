import { apiFetch } from './api/client';

export interface UploadedFile { id: string; name: string; type: string; size: number; uploadedAt: string }

export async function listFiles(): Promise<UploadedFile[]> {
  const response = await apiFetch('/api/files');
  return (await response.json() as { items: UploadedFile[] }).items;
}

export async function uploadFiles(files: File[]): Promise<UploadedFile[]> {
  if (!files.length) return [];
  const body = new FormData();
  for (const file of files) body.append('files', file);
  return (await apiFetch('/api/files', { method: 'POST', body })).json();
}

export async function deleteFile(id: string): Promise<void> {
  await apiFetch(`/api/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getFileBlob(id: string): Promise<Blob | null> {
  try { return await (await apiFetch(`/api/files/${encodeURIComponent(id)}`)).blob(); }
  catch (error) {
    if (typeof error === 'object' && error && 'status' in error && error.status === 404) return null;
    throw error;
  }
}
