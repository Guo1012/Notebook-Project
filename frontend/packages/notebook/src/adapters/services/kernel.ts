import type { JSONValue, MimeBundle, NotebookOutput } from '@lumen/nbformat';
import { ServerConnection, type ServerConnectionOptions } from './connection';

export type KernelStatus = 'unknown' | 'starting' | 'idle' | 'busy' | 'restarting' | 'dead';
export interface ExecutableCell { id?: string; source: string }
export interface ExecutionResult { executionCount: number | null; outputs: NotebookOutput[] }
export interface KernelAdapter {
  readonly name: string;
  execute(code: string, cell?: ExecutableCell): Promise<ExecutionResult>;
  interrupt(): Promise<void>;
  restart(): Promise<void>;
  shutdown(): Promise<void>;
}

interface KernelMessage {
  channel: string;
  header: { msg_id: string; msg_type: string; session: string; username: string; date: string; version: string };
  parent_header: Record<string, unknown>;
  metadata: Record<string, unknown>;
  content: Record<string, unknown>;
}

export interface JupyterKernelOptions extends ServerConnectionOptions {
  kernelName?: string;
  notebookId?: string;
  executionTimeout?: number;
}

export class JupyterKernel implements KernelAdapter {
  readonly name: string;
  private readonly connection: ServerConnection;
  private readonly sessionId = crypto.randomUUID();
  private kernelId: string | null = null;
  private socket: WebSocket | null = null;

  constructor(private readonly options: JupyterKernelOptions) {
    this.name = options.kernelName ?? 'python3';
    this.connection = new ServerConnection(options);
  }

  async execute(code: string): Promise<ExecutionResult> {
    await this.ensureConnected();
    const socket = this.socket;
    if (!socket) throw new Error('Kernel WebSocket is unavailable');
    const msgId = crypto.randomUUID();
    const outputs: NotebookOutput[] = [];
    const displayIds = new Map<string, number>();
    let executionCount: number | null = null;
    let clearBeforeNextOutput = false;
    let replyReceived = false;
    let idleReceived = false;

    return new Promise<ExecutionResult>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => finish(new Error('Kernel execution timed out')), this.options.executionTimeout ?? 120_000);
      const finish = (error?: Error) => {
        globalThis.clearTimeout(timeout);
        socket.removeEventListener('message', receive);
        error ? reject(error) : resolve({ executionCount, outputs });
      };
      const receive = (event: MessageEvent) => {
        if (typeof event.data !== 'string') return;
        let message: KernelMessage;
        try { message = JSON.parse(event.data) as KernelMessage; } catch { return; }
        if (message.parent_header?.msg_id !== msgId) return;
        const content = message.content;
        const prepareOutput = () => {
          if (!clearBeforeNextOutput) return;
          outputs.length = 0; displayIds.clear(); clearBeforeNextOutput = false;
        };
        switch (message.header.msg_type) {
          case 'status':
            if (content.execution_state === 'idle') idleReceived = true;
            if (replyReceived && idleReceived) finish();
            break;
          case 'execute_input':
            if (typeof content.execution_count === 'number') executionCount = content.execution_count;
            break;
          case 'stream':
            prepareOutput();
            outputs.push({ output_type: 'stream', name: content.name === 'stderr' ? 'stderr' : 'stdout', text: String(content.text ?? '') });
            break;
          case 'display_data':
          case 'update_display_data':
          case 'execute_result': {
            prepareOutput();
            const transient = isRecord(content.transient) ? content.transient as Record<string, JSONValue> : undefined;
            const output: NotebookOutput = {
              output_type: message.header.msg_type,
              data: (isRecord(content.data) ? content.data : {}) as MimeBundle,
              metadata: isRecord(content.metadata) ? content.metadata : {},
              ...(typeof content.execution_count === 'number' ? { execution_count: content.execution_count } : {}),
              ...(transient ? { transient } : {})
            };
            const displayId = typeof transient?.display_id === 'string' ? transient.display_id : undefined;
            if (message.header.msg_type === 'update_display_data' && displayId && displayIds.has(displayId)) outputs[displayIds.get(displayId)!] = output;
            else { outputs.push(output); if (displayId) displayIds.set(displayId, outputs.length - 1); }
            break;
          }
          case 'clear_output':
            if (content.wait === true) clearBeforeNextOutput = true;
            else { outputs.length = 0; displayIds.clear(); }
            break;
          case 'error':
            prepareOutput();
            outputs.push(errorOutput(content));
            break;
          case 'execute_reply':
            if (typeof content.execution_count === 'number') executionCount = content.execution_count;
            if (content.status === 'error' && !outputs.some(output => output.output_type === 'error')) outputs.push(errorOutput(content));
            replyReceived = true;
            if (idleReceived) finish();
            break;
        }
      };
      socket.addEventListener('message', receive);
      socket.send(JSON.stringify(this.message('execute_request', msgId, {
        code, silent: false, store_history: true, user_expressions: {}, allow_stdin: false, stop_on_error: true
      })));
    });
  }

  async interrupt(): Promise<void> {
    if (this.kernelId) await this.connection.request(`/api/kernels/${this.kernelId}/interrupt`, { method: 'POST' });
  }

  async restart(): Promise<void> {
    if (this.kernelId) await this.connection.request(`/api/kernels/${this.kernelId}/restart`, { method: 'POST' });
  }

  async shutdown(): Promise<void> {
    this.socket?.close(); this.socket = null;
    if (this.kernelId) await this.connection.request(`/api/kernels/${this.kernelId}`, { method: 'DELETE' });
    this.kernelId = null;
  }

  private async ensureConnected(): Promise<void> {
    if (!this.kernelId) {
      const response = await this.connection.request('/api/kernels', {
        method: 'POST',
        headers: this.options.notebookId ? { 'X-Lumen-Notebook-Id': this.options.notebookId } : undefined,
        body: JSON.stringify({ name: this.name })
      });
      this.kernelId = (await response.json() as { id: string }).id;
    }
    if (this.socket?.readyState === WebSocket.OPEN) return;
    this.socket = this.connection.createWebSocket(`/api/kernels/${this.kernelId}/channels`, { session_id: this.sessionId });
    await new Promise<void>((resolve, reject) => {
      this.socket!.addEventListener('open', () => resolve(), { once: true });
      this.socket!.addEventListener('error', () => reject(new Error('Unable to connect to Jupyter kernel')), { once: true });
    });
  }

  private message(type: string, msgId: string, content: Record<string, unknown>): KernelMessage {
    return { channel: 'shell', header: { msg_id: msgId, msg_type: type, session: this.sessionId, username: 'lumen', date: new Date().toISOString(), version: '5.3' }, parent_header: {}, metadata: {}, content };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const errorOutput = (content: Record<string, unknown>): NotebookOutput => ({ output_type: 'error', ename: String(content.ename ?? 'Error'), evalue: String(content.evalue ?? ''), traceback: Array.isArray(content.traceback) ? content.traceback.map(String) : [] });

export class MockKernel implements KernelAdapter {
  readonly name: string;
  private executionCount = 0;
  private generation = 0;
  constructor(name = 'Python 3 (mock)') { this.name = name; }
  async execute(code: string): Promise<ExecutionResult> {
    const generation = this.generation;
    await new Promise(resolve => globalThis.setTimeout(resolve, 25));
    if (generation !== this.generation) throw new Error('Kernel interrupted');
    this.executionCount += 1;
    const prints = [...code.matchAll(/print\((?:f?["'])(.*?)(?:["'])\)/g)].map(match => match[1] ?? '');
    return { executionCount: this.executionCount, outputs: [{ output_type: 'stream', name: 'stdout', text: prints.join('\n') || 'Execution completed' }] };
  }
  async interrupt(): Promise<void> { this.generation += 1; }
  async restart(): Promise<void> { this.generation += 1; this.executionCount = 0; }
  async shutdown(): Promise<void> { this.generation += 1; }
}
