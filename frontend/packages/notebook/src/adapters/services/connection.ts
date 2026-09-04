export interface ServerConnectionOptions {
  baseUrl: string;
  token?: string;
  fetch?: typeof globalThis.fetch;
  WebSocket?: typeof globalThis.WebSocket;
}

export class ServerConnection {
  readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(readonly options: ServerConnectionOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');
    if (this.options.token) headers.set('Authorization', `token ${this.options.token}`);
    const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers, credentials: 'include' });
    if (!response.ok) throw new Error(`Jupyter Server request failed: ${response.status} ${response.statusText}`);
    return response;
  }

  websocketUrl(path: string, query: Record<string, string> = {}): string {
    const base = new URL(this.baseUrl, globalThis.location?.href ?? 'http://localhost/');
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    base.pathname = `${base.pathname.replace(/\/$/, '')}${path}`;
    for (const [key, value] of Object.entries(query)) base.searchParams.set(key, value);
    if (this.options.token) base.searchParams.set('token', this.options.token);
    return base.toString();
  }

  createWebSocket(path: string, query: Record<string, string> = {}): WebSocket {
    const WebSocketConstructor = this.options.WebSocket ?? globalThis.WebSocket;
    if (!WebSocketConstructor) throw new Error('WebSocket is unavailable in this environment');
    return new WebSocketConstructor(this.websocketUrl(path, query));
  }
}
