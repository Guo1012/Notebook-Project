import { goto } from '$app/navigation';
import { newTraceId, trace, traceError } from '$lib/trace';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly detail?: unknown) {
    super(message);
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const requestId = headers.get('X-Request-Id') ?? newTraceId();
  headers.set('X-Request-Id', requestId);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const started = performance.now();
  trace('api_request_started', { requestId, method: init.method ?? 'GET', path });
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: 'include' });
  } catch (error) {
    traceError('api_request_failed', error, { requestId, method: init.method ?? 'GET', path });
    throw error;
  }
  trace('api_request_finished', {
    requestId,
    method: init.method ?? 'GET',
    path,
    status: response.status,
    durationMs: Math.round(performance.now() - started)
  });
  if (response.ok) return response;
  let body: { detail?: { code?: string; message?: string } | string } = {};
  try { body = await response.json(); } catch { /* use status text */ }
  const detail = body.detail;
  const code = typeof detail === 'object' ? detail.code ?? 'API_ERROR' : 'API_ERROR';
  const message = typeof detail === 'object' ? detail.message ?? response.statusText : typeof detail === 'string' ? detail : response.statusText;
  if (response.status === 401 && globalThis.location?.pathname !== '/login') void goto('/login');
  throw new ApiError(response.status, code, message, detail);
}
