import { ServerConnection } from './connection';
export class JupyterKernel {
    options;
    name;
    connection;
    sessionId = crypto.randomUUID();
    kernelId = null;
    socket = null;
    constructor(options) {
        this.options = options;
        this.name = options.kernelName ?? 'python3';
        this.connection = new ServerConnection(options);
    }
    async execute(code, cell) {
        const traceId = cell?.traceId ?? crypto.randomUUID();
        await this.ensureConnected(traceId);
        const socket = this.socket;
        if (!socket)
            throw new Error('Kernel WebSocket is unavailable');
        const msgId = crypto.randomUUID();
        const outputs = [];
        const displayIds = new Map();
        let executionCount = null;
        let clearBeforeNextOutput = false;
        let replyReceived = false;
        let idleReceived = false;
        return new Promise((resolve, reject) => {
            const timeout = globalThis.setTimeout(() => finish(new Error('Kernel execution timed out')), this.options.executionTimeout ?? 120_000);
            const finish = (error) => {
                globalThis.clearTimeout(timeout);
                socket.removeEventListener('message', receive);
                error ? reject(error) : resolve({ executionCount, outputs });
            };
            const receive = (event) => {
                if (typeof event.data !== 'string')
                    return;
                let message;
                try {
                    message = JSON.parse(event.data);
                }
                catch {
                    return;
                }
                if (message.parent_header?.msg_id !== msgId)
                    return;
                const content = message.content;
                const prepareOutput = () => {
                    if (!clearBeforeNextOutput)
                        return;
                    outputs.length = 0;
                    displayIds.clear();
                    clearBeforeNextOutput = false;
                };
                switch (message.header.msg_type) {
                    case 'status':
                        if (content.execution_state === 'idle')
                            idleReceived = true;
                        if (replyReceived && idleReceived)
                            finish();
                        break;
                    case 'execute_input':
                        if (typeof content.execution_count === 'number')
                            executionCount = content.execution_count;
                        break;
                    case 'stream':
                        prepareOutput();
                        outputs.push({ output_type: 'stream', name: content.name === 'stderr' ? 'stderr' : 'stdout', text: String(content.text ?? '') });
                        break;
                    case 'display_data':
                    case 'update_display_data':
                    case 'execute_result': {
                        prepareOutput();
                        const transient = isRecord(content.transient) ? content.transient : undefined;
                        const output = {
                            output_type: message.header.msg_type,
                            data: (isRecord(content.data) ? content.data : {}),
                            metadata: isRecord(content.metadata) ? content.metadata : {},
                            ...(typeof content.execution_count === 'number' ? { execution_count: content.execution_count } : {}),
                            ...(transient ? { transient } : {})
                        };
                        const displayId = typeof transient?.display_id === 'string' ? transient.display_id : undefined;
                        if (message.header.msg_type === 'update_display_data' && displayId && displayIds.has(displayId))
                            outputs[displayIds.get(displayId)] = output;
                        else {
                            outputs.push(output);
                            if (displayId)
                                displayIds.set(displayId, outputs.length - 1);
                        }
                        break;
                    }
                    case 'clear_output':
                        if (content.wait === true)
                            clearBeforeNextOutput = true;
                        else {
                            outputs.length = 0;
                            displayIds.clear();
                        }
                        break;
                    case 'error':
                        prepareOutput();
                        outputs.push(errorOutput(content));
                        break;
                    case 'execute_reply':
                        if (typeof content.execution_count === 'number')
                            executionCount = content.execution_count;
                        if (content.status === 'error' && !outputs.some(output => output.output_type === 'error'))
                            outputs.push(errorOutput(content));
                        replyReceived = true;
                        if (idleReceived)
                            finish();
                        break;
                }
            };
            socket.addEventListener('message', receive);
            socket.send(JSON.stringify(this.message('execute_request', msgId, {
                code, silent: false, store_history: true, user_expressions: {}, allow_stdin: false, stop_on_error: true
            })));
        });
    }
    async interrupt() {
        if (this.kernelId)
            await this.connection.request(`/api/kernels/${this.kernelId}/interrupt`, { method: 'POST' });
    }
    async restart() {
        if (this.kernelId)
            await this.connection.request(`/api/kernels/${this.kernelId}/restart`, { method: 'POST' });
    }
    async shutdown() {
        this.socket?.close();
        this.socket = null;
        if (this.kernelId)
            await this.connection.request(`/api/kernels/${this.kernelId}`, { method: 'DELETE' });
        this.kernelId = null;
    }
    async ensureConnected(traceId) {
        if (!this.kernelId) {
            const headers = { 'X-Request-Id': traceId };
            if (this.options.notebookId)
                headers['X-Lumen-Notebook-Id'] = this.options.notebookId;
            const response = await this.connection.request('/api/kernels', {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: this.name })
            });
            this.kernelId = (await response.json()).id;
        }
        if (this.socket?.readyState === WebSocket.OPEN)
            return;
        this.socket = this.connection.createWebSocket(`/api/kernels/${this.kernelId}/channels`, {
            session_id: this.sessionId,
            trace_id: traceId
        });
        await new Promise((resolve, reject) => {
            this.socket.addEventListener('open', () => resolve(), { once: true });
            this.socket.addEventListener('error', () => reject(new Error('Unable to connect to Jupyter kernel')), { once: true });
        });
    }
    message(type, msgId, content) {
        return { channel: 'shell', header: { msg_id: msgId, msg_type: type, session: this.sessionId, username: 'lumen', date: new Date().toISOString(), version: '5.3' }, parent_header: {}, metadata: {}, content };
    }
}
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const errorOutput = (content) => ({ output_type: 'error', ename: String(content.ename ?? 'Error'), evalue: String(content.evalue ?? ''), traceback: Array.isArray(content.traceback) ? content.traceback.map(String) : [] });
export class MockKernel {
    name;
    executionCount = 0;
    generation = 0;
    constructor(name = 'Python 3 (mock)') { this.name = name; }
    async execute(code) {
        const generation = this.generation;
        await new Promise(resolve => globalThis.setTimeout(resolve, 25));
        if (generation !== this.generation)
            throw new Error('Kernel interrupted');
        this.executionCount += 1;
        const prints = [...code.matchAll(/print\((?:f?["'])(.*?)(?:["'])\)/g)].map(match => match[1] ?? '');
        return { executionCount: this.executionCount, outputs: [{ output_type: 'stream', name: 'stdout', text: prints.join('\n') || 'Execution completed' }] };
    }
    async interrupt() { this.generation += 1; }
    async restart() { this.generation += 1; this.executionCount = 0; }
    async shutdown() { this.generation += 1; }
}
