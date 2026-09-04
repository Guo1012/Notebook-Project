export type KernelStatusState = 'unknown' | 'starting' | 'idle' | 'busy' | 'restarting' | 'dead';

export interface KernelStatusSource {
  readonly kernelDisplayName: string;
  subscribe(listener: (status: KernelStatusState) => void): void | (() => void);
}

export type ToolbarItemKind = 'default' | 'primary' | 'danger';

export interface ToolbarItem {
  id: string;
  label: string;
  title?: string;
  group?: string;
  kind?: ToolbarItemKind;
  active?: boolean;
  disabled?: boolean;
  run(): void | Promise<void>;
}

export interface StatusItem {
  id: string;
  label: string;
  title?: string;
}
