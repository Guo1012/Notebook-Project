import type { NotebookOutput } from '@lumen/nbformat';
import { type ServerConnectionOptions } from './connection';
export type KernelStatus = 'unknown' | 'starting' | 'idle' | 'busy' | 'restarting' | 'dead';
export interface ExecutableCell {
    id?: string;
    source: string;
}
export interface ExecutionResult {
    executionCount: number | null;
    outputs: NotebookOutput[];
}
export interface KernelAdapter {
    readonly name: string;
    execute(code: string, cell?: ExecutableCell): Promise<ExecutionResult>;
    interrupt(): Promise<void>;
    restart(): Promise<void>;
    shutdown(): Promise<void>;
}
export interface JupyterKernelOptions extends ServerConnectionOptions {
    kernelName?: string;
    notebookId?: string;
    executionTimeout?: number;
}
export declare class JupyterKernel implements KernelAdapter {
    private readonly options;
    readonly name: string;
    private readonly connection;
    private readonly sessionId;
    private kernelId;
    private socket;
    constructor(options: JupyterKernelOptions);
    execute(code: string): Promise<ExecutionResult>;
    interrupt(): Promise<void>;
    restart(): Promise<void>;
    shutdown(): Promise<void>;
    private ensureConnected;
    private message;
}
export declare class MockKernel implements KernelAdapter {
    readonly name: string;
    private executionCount;
    private generation;
    constructor(name?: string);
    execute(code: string): Promise<ExecutionResult>;
    interrupt(): Promise<void>;
    restart(): Promise<void>;
    shutdown(): Promise<void>;
}
