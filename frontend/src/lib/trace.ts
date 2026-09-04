export type TraceFields = Record<string, unknown>;

export function newTraceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `trace-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function trace(event: string, fields: TraceFields = {}): void {
  console.info('[LumenTrace]', { event, at: new Date().toISOString(), ...fields });
}

export function traceError(event: string, error: unknown, fields: TraceFields = {}): void {
  console.error('[LumenTrace]', {
    event,
    at: new Date().toISOString(),
    ...fields,
    error: error instanceof Error ? error.message : String(error)
  });
}
