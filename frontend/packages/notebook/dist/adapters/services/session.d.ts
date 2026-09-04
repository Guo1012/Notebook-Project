import { Signal } from '@lumino/signaling';
import type { ExecutableCell, ExecutionResult, KernelAdapter, KernelStatus } from './kernel';
export declare class SessionContext {
    readonly kernel: KernelAdapter;
    status: KernelStatus;
    readonly statusChanged: Signal<SessionContext, KernelStatus>;
    readonly kernelDisplayName: string;
    constructor(kernel: KernelAdapter);
    subscribe(listener: (status: KernelStatus) => void): () => void;
    execute(cell: ExecutableCell): Promise<ExecutionResult>;
    interrupt(): Promise<void>;
    restart(): Promise<void>;
    shutdown(): Promise<void>;
    private setStatus;
}
