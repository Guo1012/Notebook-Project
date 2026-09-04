import { UUID } from '@lumino/coreutils';
import { Signal } from '@lumino/signaling';
export class LspClient {
    url;
    notification = new Signal(this);
    diagnostics = new Signal(this);
    socket;
    pending = new Map();
    constructor(url) {
        this.url = url;
    }
    async connect() {
        if (this.socket?.readyState === WebSocket.OPEN)
            return;
        this.socket = new WebSocket(this.url);
        this.socket.addEventListener('message', (event) => this.receive(String(event.data)));
        await new Promise((resolve, reject) => { this.socket.addEventListener('open', () => resolve(), { once: true }); this.socket.addEventListener('error', () => reject(new Error('LSP connection failed')), { once: true }); });
    }
    request(method, params) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN)
            return Promise.reject(new Error('LSP is not connected'));
        const id = `lsp-${UUID.uuid4()}`;
        this.socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
        return new Promise((resolve, reject) => this.pending.set(id, { resolve: resolve, reject }));
    }
    notify(method, params) { this.socket?.send(JSON.stringify({ jsonrpc: '2.0', method, params })); }
    close() { this.socket?.close(); this.socket = undefined; for (const call of this.pending.values())
        call.reject(new Error('LSP closed')); this.pending.clear(); }
    receive(raw) {
        const message = JSON.parse(raw);
        if (message.id !== undefined) {
            const call = this.pending.get(message.id);
            if (!call)
                return;
            this.pending.delete(message.id);
            message.error ? call.reject(new Error(message.error.message)) : call.resolve(message.result);
            return;
        }
        if (!message.method)
            return;
        if (message.method === 'textDocument/publishDiagnostics') {
            const value = message.params;
            this.diagnostics.emit(value);
        }
        this.notification.emit({ method: message.method, params: message.params });
    }
}
