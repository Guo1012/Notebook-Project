import { Signal } from '@lumino/signaling';
export interface Position {
    line: number;
    character: number;
}
export interface Range {
    start: Position;
    end: Position;
}
export interface Diagnostic {
    range: Range;
    message: string;
    severity?: number;
    source?: string;
}
export declare class LspClient {
    readonly url: string;
    readonly notification: Signal<this, {
        method: string;
        params: unknown;
    }>;
    readonly diagnostics: Signal<this, {
        uri: string;
        diagnostics: Diagnostic[];
    }>;
    private socket?;
    private pending;
    constructor(url: string);
    connect(): Promise<void>;
    request<T>(method: string, params: unknown): Promise<T>;
    notify(method: string, params: unknown): void;
    close(): void;
    private receive;
}
