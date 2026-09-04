import { Signal } from '@lumino/signaling';
export class SettingsRegistry {
    changed = new Signal(this);
    schemas = new Map();
    values = new Map();
    register(plugin, schema) {
        if (this.schemas.has(plugin))
            throw new Error(`Settings already registered: ${plugin}`);
        this.schemas.set(plugin, schema);
        this.values.set(plugin, Object.fromEntries(Object.entries(schema).map(([key, entry]) => [key, entry.default])));
    }
    get(plugin, key) {
        if (!this.schemas.has(plugin))
            throw new Error(`Unknown settings plugin: ${plugin}`);
        return this.values.get(plugin)?.[key];
    }
    set(plugin, key, value) {
        const rule = this.schemas.get(plugin)?.[key];
        if (!rule)
            throw new Error(`Unknown setting: ${plugin}.${key}`);
        if (rule.validate && !rule.validate(value))
            throw new TypeError(`Invalid setting: ${plugin}.${key}`);
        this.values.set(plugin, { ...this.values.get(plugin), [key]: value });
        this.changed.emit({ plugin, key, value });
    }
    snapshot(plugin) {
        return { ...this.values.get(plugin) };
    }
}
export const NOTEBOOK_SETTINGS_ID = '@lumen/notebook';
export const notebookSettingSchema = {
    showToolbar: { default: true, validate: (value) => typeof value === 'boolean' },
    showStatusBar: { default: true, validate: (value) => typeof value === 'boolean' },
    showTableOfContents: { default: false, validate: (value) => typeof value === 'boolean' },
    showCellToolbar: { default: true, validate: (value) => typeof value === 'boolean' },
    trusted: { default: false, validate: (value) => typeof value === 'boolean' },
    autosaveInterval: { default: 120_000, validate: (value) => typeof value === 'number' && value >= 0 },
    maxUndoHistory: { default: 100, validate: (value) => typeof value === 'number' && value > 0 }
};
export function createNotebookSettings() {
    const registry = new SettingsRegistry();
    registry.register(NOTEBOOK_SETTINGS_ID, notebookSettingSchema);
    return registry;
}
