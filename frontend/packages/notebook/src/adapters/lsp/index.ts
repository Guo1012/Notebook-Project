import { UUID } from '@lumino/coreutils';
import { Signal } from '@lumino/signaling';
export interface Position { line: number; character: number }
export interface Range { start: Position; end: Position }
export interface Diagnostic { range: Range; message: string; severity?: number; source?: string }
interface RpcResponse { id?: string | number; method?: string; result?: unknown; error?: { code: number; message: string }; params?: unknown }
export class LspClient {
  readonly notification = new Signal<this, { method: string; params: unknown }>(this);
  readonly diagnostics = new Signal<this, { uri: string; diagnostics: Diagnostic[] }>(this);
  private socket?: WebSocket;
  private pending = new Map<string | number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();
  constructor(readonly url: string) {}
  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    this.socket = new WebSocket(this.url); this.socket.addEventListener('message', (event) => this.receive(String(event.data)));
    await new Promise<void>((resolve, reject) => { this.socket!.addEventListener('open', () => resolve(), { once: true }); this.socket!.addEventListener('error', () => reject(new Error('LSP connection failed')), { once: true }); });
  }
  request<T>(method: string, params: unknown): Promise<T> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('LSP is not connected'));
    const id = `lsp-${UUID.uuid4()}`; this.socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    return new Promise<T>((resolve, reject) => this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject }));
  }
  notify(method: string, params: unknown): void { this.socket?.send(JSON.stringify({ jsonrpc: '2.0', method, params })); }
  close(): void { this.socket?.close(); this.socket = undefined; for (const call of this.pending.values()) call.reject(new Error('LSP closed')); this.pending.clear(); }
  private receive(raw: string): void {
    const message = JSON.parse(raw) as RpcResponse;
    if (message.id !== undefined) { const call = this.pending.get(message.id); if (!call) return; this.pending.delete(message.id); message.error ? call.reject(new Error(message.error.message)) : call.resolve(message.result); return; }
    if (!message.method) return;
    if (message.method === 'textDocument/publishDiagnostics') { const value = message.params as { uri: string; diagnostics: Diagnostic[] }; this.diagnostics.emit(value); }
    this.notification.emit({ method: message.method, params: message.params });
  }
}
