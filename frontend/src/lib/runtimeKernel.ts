import type { ExecutableCell, ExecutionResult, KernelAdapter } from '$lib/sessionContext';
import { JupyterServerKernelAdapter } from '$lib/sessionContext';
import { ensureRuntimeReady } from '$lib/runtime';
import { newTraceId, trace, traceError } from '$lib/trace';

export class RuntimeKernelAdapter implements KernelAdapter {
  readonly name = 'Python 3';
  private delegate: KernelAdapter | null = null;
  private connecting: Promise<KernelAdapter> | null = null;

  constructor(private readonly notebookId: string) {}

  async execute(code: string, cell?: ExecutableCell): Promise<ExecutionResult> {
    const traceId = newTraceId();
    trace('cell_execution_started', { traceId, notebookId: this.notebookId, cellId: cell?.id });
    try {
      const delegate = await this.ensureDelegate(traceId);
      const result = await delegate.execute(code, cell ? { ...cell, traceId } : { source: code, traceId });
      trace('cell_execution_finished', {
        traceId,
        notebookId: this.notebookId,
        cellId: cell?.id,
        executionCount: result.executionCount
      });
      return result;
    } catch (error) {
      traceError('cell_execution_failed', error, { traceId, notebookId: this.notebookId, cellId: cell?.id });
      throw error;
    }
  }

  async interrupt(): Promise<void> { await this.delegate?.interrupt(); }
  async restart(): Promise<void> { await this.delegate?.restart(); }
  async shutdown(): Promise<void> {
    const delegate = this.delegate;
    this.delegate = null;
    this.connecting = null;
    await delegate?.shutdown();
  }

  private async ensureDelegate(traceId: string): Promise<KernelAdapter> {
    if (this.delegate) {
      trace('kernel_adapter_reused', { traceId, notebookId: this.notebookId });
      return this.delegate;
    }
    if (!this.connecting) {
      this.connecting = ensureRuntimeReady(traceId).then((runtime) => {
        const kernel = new JupyterServerKernelAdapter({
          baseUrl: `/runtime-proxy/${runtime.runtimeId}`,
          kernelName: 'python3',
          notebookId: this.notebookId
        });
        this.delegate = kernel;
        trace('kernel_adapter_created', { traceId, notebookId: this.notebookId, runtimeId: runtime.runtimeId });
        return kernel;
      }).finally(() => { this.connecting = null; });
    }
    return this.connecting;
  }
}
