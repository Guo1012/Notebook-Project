import { Signal } from '@lumino/signaling';
export class SessionContext {
    kernel;
    status = 'unknown';
    statusChanged;
    kernelDisplayName;
    constructor(kernel) {
        this.kernel = kernel;
        this.statusChanged = new Signal(this);
        this.kernelDisplayName = kernel.name;
        this.setStatus('idle');
    }
    subscribe(listener) {
        const slot = (_sender, status) => listener(status);
        this.statusChanged.connect(slot);
        listener(this.status);
        return () => { this.statusChanged.disconnect(slot); };
    }
    async execute(cell) {
        this.setStatus('busy');
        try {
            return await this.kernel.execute(cell.source, cell);
        }
        catch (error) {
            this.setStatus('idle');
            throw error;
        }
        finally {
            if (this.status === 'busy')
                this.setStatus('idle');
        }
    }
    async interrupt() { await this.kernel.interrupt(); this.setStatus('idle'); }
    async restart() { this.setStatus('restarting'); try {
        await this.kernel.restart();
        this.setStatus('idle');
    }
    catch (error) {
        this.setStatus('dead');
        throw error;
    } }
    async shutdown() { await this.kernel.shutdown(); this.setStatus('dead'); }
    setStatus(status) {
        this.status = status;
        this.statusChanged.emit(status);
    }
}
