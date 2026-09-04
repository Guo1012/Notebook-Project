import { apiFetch } from '$lib/api/client';

export type RuntimeState = 'QUEUED' | 'REQUESTED' | 'PROVISIONING' | 'STARTING' | 'READY' | 'STOPPING' | 'FAILED' | 'STOPPED';
export interface RuntimeInfo { runtimeId: string; state: RuntimeState; failureReason: string | null }

const delay = (milliseconds: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds));

export async function ensureRuntimeReady(): Promise<RuntimeInfo> {
  let response = await apiFetch('/runtime-api/api/runtime', {
    method: 'PUT',
    body: JSON.stringify({ profile: 'python-small' })
  });
  let runtime = await response.json() as RuntimeInfo;
  const deadline = Date.now() + 120_000;
  while (runtime.state !== 'READY') {
    if (runtime.state === 'FAILED' || runtime.state === 'STOPPED' || runtime.state === 'STOPPING') {
      throw new Error(runtime.failureReason || `Runtime entered ${runtime.state}`);
    }
    if (Date.now() >= deadline) throw new Error('Jupyter Server startup timed out');
    await delay(500);
    response = await apiFetch('/runtime-api/api/runtime');
    runtime = await response.json() as RuntimeInfo;
  }
  return runtime;
}
