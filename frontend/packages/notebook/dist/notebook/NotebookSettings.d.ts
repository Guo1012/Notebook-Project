import { Signal } from '@lumino/signaling';
export type SettingSchema = Record<string, {
    default: unknown;
    validate?: (value: unknown) => boolean;
}>;
export declare class SettingsRegistry {
    readonly changed: Signal<this, {
        plugin: string;
        key: string;
        value: unknown;
    }>;
    private schemas;
    private values;
    register(plugin: string, schema: SettingSchema): void;
    get<T>(plugin: string, key: string): T;
    set(plugin: string, key: string, value: unknown): void;
    snapshot(plugin: string): Readonly<Record<string, unknown>>;
}
export declare const NOTEBOOK_SETTINGS_ID = "@lumen/notebook";
export declare const notebookSettingSchema: {
    showToolbar: {
        default: boolean;
        validate: (value: unknown) => value is boolean;
    };
    showStatusBar: {
        default: boolean;
        validate: (value: unknown) => value is boolean;
    };
    showTableOfContents: {
        default: boolean;
        validate: (value: unknown) => value is boolean;
    };
    showCellToolbar: {
        default: boolean;
        validate: (value: unknown) => value is boolean;
    };
    trusted: {
        default: boolean;
        validate: (value: unknown) => value is boolean;
    };
    autosaveInterval: {
        default: number;
        validate: (value: unknown) => boolean;
    };
    maxUndoHistory: {
        default: number;
        validate: (value: unknown) => boolean;
    };
};
export declare function createNotebookSettings(): SettingsRegistry;
