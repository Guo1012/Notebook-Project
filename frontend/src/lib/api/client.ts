import { goto } from '$app/navigation';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly detail?: unknown) {
    super(message);
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  if (response.ok) return response;
  let body: { detail?: { code?: string; message?: string } | string } = {};
  try { body = await response.json(); } catch { /* use status text */ }
  const detail = body.detail;
  const code = typeof detail === 'object' ? detail.code ?? 'API_ERROR' : 'API_ERROR';
  const message = typeof detail === 'object' ? detail.message ?? response.statusText : typeof detail === 'string' ? detail : response.statusText;
  if (response.status === 401 && globalThis.location?.pathname !== '/login') void goto('/login');
  throw new ApiError(response.status, code, message, detail);
}
