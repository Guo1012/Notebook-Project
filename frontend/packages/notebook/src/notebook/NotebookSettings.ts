import { Signal } from '@lumino/signaling';

export type SettingSchema = Record<string, { default: unknown; validate?: (value: unknown) => boolean }>;

export class SettingsRegistry {
  readonly changed = new Signal<this, { plugin: string; key: string; value: unknown }>(this);
  private schemas = new Map<string, SettingSchema>();
  private values = new Map<string, Record<string, unknown>>();

  register(plugin: string, schema: SettingSchema): void {
    if (this.schemas.has(plugin)) throw new Error(`Settings already registered: ${plugin}`);
    this.schemas.set(plugin, schema);
    this.values.set(plugin, Object.fromEntries(Object.entries(schema).map(([key, entry]) => [key, entry.default])));
  }

  get<T>(plugin: string, key: string): T {
    if (!this.schemas.has(plugin)) throw new Error(`Unknown settings plugin: ${plugin}`);
    return this.values.get(plugin)?.[key] as T;
  }

  set(plugin: string, key: string, value: unknown): void {
    const rule = this.schemas.get(plugin)?.[key];
    if (!rule) throw new Error(`Unknown setting: ${plugin}.${key}`);
    if (rule.validate && !rule.validate(value)) throw new TypeError(`Invalid setting: ${plugin}.${key}`);
    this.values.set(plugin, { ...this.values.get(plugin), [key]: value });
    this.changed.emit({ plugin, key, value });
  }

  snapshot(plugin: string): Readonly<Record<string, unknown>> {
    return { ...this.values.get(plugin) };
  }
}

export const NOTEBOOK_SETTINGS_ID = '@lumen/notebook';
export const notebookSettingSchema = {
  showToolbar: { default: true, validate: (value: unknown) => typeof value === 'boolean' },
  showStatusBar: { default: true, validate: (value: unknown) => typeof value === 'boolean' },
  showTableOfContents: { default: false, validate: (value: unknown) => typeof value === 'boolean' },
  showCellToolbar: { default: true, validate: (value: unknown) => typeof value === 'boolean' },
  trusted: { default: false, validate: (value: unknown) => typeof value === 'boolean' },
  autosaveInterval: { default: 120_000, validate: (value: unknown) => typeof value === 'number' && value >= 0 },
  maxUndoHistory: { default: 100, validate: (value: unknown) => typeof value === 'number' && value > 0 }
};

export function createNotebookSettings(): SettingsRegistry {
  const registry = new SettingsRegistry();
  registry.register(NOTEBOOK_SETTINGS_ID, notebookSettingSchema);
  return registry;
}
