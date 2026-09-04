import { Signal } from '@lumino/signaling';
import type { ExecutableCell, ExecutionResult, KernelAdapter, KernelStatus } from './kernel';

export class SessionContext {
  status: KernelStatus = 'unknown';
  readonly statusChanged: Signal<SessionContext, KernelStatus>;
  readonly kernelDisplayName: string;

  constructor(readonly kernel: KernelAdapter) {
    this.statusChanged = new Signal<SessionContext, KernelStatus>(this);
    this.kernelDisplayName = kernel.name;
    this.setStatus('idle');
  }

  subscribe(listener: (status: KernelStatus) => void): () => void {
    const slot = (_sender: SessionContext, status: KernelStatus) => listener(status);
    this.statusChanged.connect(slot);
    listener(this.status);
    return () => { this.statusChanged.disconnect(slot); };
  }

  async execute(cell: ExecutableCell): Promise<ExecutionResult> {
    this.setStatus('busy');
    try { return await this.kernel.execute(cell.source, cell); }
    catch (error) { this.setStatus('idle'); throw error; }
    finally { if (this.status === 'busy') this.setStatus('idle'); }
  }

  async interrupt(): Promise<void> { await this.kernel.interrupt(); this.setStatus('idle'); }
  async restart(): Promise<void> { this.setStatus('restarting'); try { await this.kernel.restart(); this.setStatus('idle'); } catch (error) { this.setStatus('dead'); throw error; } }
  async shutdown(): Promise<void> { await this.kernel.shutdown(); this.setStatus('dead'); }

  private setStatus(status: KernelStatus): void {
    this.status = status;
    this.statusChanged.emit(status);
  }
}
