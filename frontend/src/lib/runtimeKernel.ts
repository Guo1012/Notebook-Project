import type { ExecutableCell, ExecutionResult, KernelAdapter } from '$lib/sessionContext';
import { JupyterServerKernelAdapter } from '$lib/sessionContext';
import { ensureRuntimeReady } from '$lib/runtime';

export class RuntimeKernelAdapter implements KernelAdapter {
  readonly name = 'Python 3';
  private delegate: KernelAdapter | null = null;
  private connecting: Promise<KernelAdapter> | null = null;

  constructor(private readonly notebookId: string) {}

  async execute(code: string, cell?: ExecutableCell): Promise<ExecutionResult> {
    return (await this.ensureDelegate()).execute(code, cell);
  }

  async interrupt(): Promise<void> { await this.delegate?.interrupt(); }
  async restart(): Promise<void> { await this.delegate?.restart(); }
  async shutdown(): Promise<void> {
    const delegate = this.delegate;
    this.delegate = null;
    this.connecting = null;
    await delegate?.shutdown();
  }

  private async ensureDelegate(): Promise<KernelAdapter> {
    if (this.delegate) return this.delegate;
    if (!this.connecting) {
      this.connecting = ensureRuntimeReady().then((runtime) => {
        const kernel = new JupyterServerKernelAdapter({
          baseUrl: `/runtime-proxy/${runtime.runtimeId}`,
          kernelName: 'python3',
          notebookId: this.notebookId
        });
        this.delegate = kernel;
        return kernel;
      }).finally(() => { this.connecting = null; });
    }
    return this.connecting;
  }
}
