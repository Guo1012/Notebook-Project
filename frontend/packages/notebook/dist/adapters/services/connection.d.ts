export interface ServerConnectionOptions {
    baseUrl: string;
    token?: string;
    fetch?: typeof globalThis.fetch;
    WebSocket?: typeof globalThis.WebSocket;
}
export declare class ServerConnection {
    readonly options: ServerConnectionOptions;
    readonly baseUrl: string;
    private readonly fetcher;
    constructor(options: ServerConnectionOptions);
    request(path: string, init?: RequestInit): Promise<Response>;
    websocketUrl(path: string, query?: Record<string, string>): string;
    createWebSocket(path: string, query?: Record<string, string>): WebSocket;
}
