import { apiFetch } from '$lib/api/client';
import { newTraceId, trace, traceError } from '$lib/trace';

export type RuntimeState = 'QUEUED' | 'REQUESTED' | 'PROVISIONING' | 'STARTING' | 'READY' | 'STOPPING' | 'FAILED' | 'STOPPED';
export interface RuntimeInfo { runtimeId: string; state: RuntimeState; failureReason: string | null }

const delay = (milliseconds: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds));

export async function ensureRuntimeReady(requestId = newTraceId()): Promise<RuntimeInfo> {
  trace('runtime_ensure_started', { requestId });
  try {
    let response = await apiFetch('/runtime-api/api/runtime', {
      method: 'PUT',
      headers: { 'X-Request-Id': requestId },
      body: JSON.stringify({ profile: 'python-small' })
    });
    let runtime = await response.json() as RuntimeInfo;
    let previousState: RuntimeState | null = null;
    const deadline = Date.now() + 120_000;
    while (runtime.state !== 'READY') {
      if (runtime.state !== previousState) {
        trace('runtime_state_observed', { requestId, runtimeId: runtime.runtimeId, state: runtime.state });
        previousState = runtime.state;
      }
      if (runtime.state === 'FAILED' || runtime.state === 'STOPPED' || runtime.state === 'STOPPING') {
        throw new Error(runtime.failureReason || `Runtime entered ${runtime.state}`);
      }
      if (Date.now() >= deadline) throw new Error('Jupyter Server startup timed out');
      await delay(500);
      response = await apiFetch('/runtime-api/api/runtime', {
        headers: { 'X-Request-Id': requestId }
      });
      runtime = await response.json() as RuntimeInfo;
    }
    trace('runtime_ready', { requestId, runtimeId: runtime.runtimeId });
    return runtime;
  } catch (error) {
    traceError('runtime_ensure_failed', error, { requestId });
    throw error;
  }
}
