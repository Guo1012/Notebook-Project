/**
 * Application compatibility entry point. Kernel/session behavior is exported by
 * @lumen/notebook while its package dependencies stay on official Jupyter APIs.
 */
export {
  BrowserKernelAdapter,
  JupyterServerKernelAdapter,
  JupyterKernel,
  MockKernel,
  ServerConnection,
  SessionContext
} from '@lumen/notebook';
export type {
  ExecutableCell,
  ExecutionResult,
  JupyterKernelOptions,
  KernelAdapter,
  KernelStatus,
  ServerConnectionOptions
} from '@lumen/notebook';
