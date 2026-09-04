import { ServerConnection } from './connection';
export class ContentsManager {
    connection;
    constructor(connection) {
        this.connection = connection;
    }
    async get(path, content = true) {
        const encoded = path.split('/').map(encodeURIComponent).join('/');
        const response = await this.connection.request(`/api/contents/${encoded}?content=${content ? '1' : '0'}`);
        return response.json();
    }
    async save(path, notebook) {
        const encoded = path.split('/').map(encodeURIComponent).join('/');
        const response = await this.connection.request(`/api/contents/${encoded}`, { method: 'PUT', body: JSON.stringify({ type: 'notebook', format: 'json', content: notebook }) });
        return response.json();
    }
    async delete(path) {
        const encoded = path.split('/').map(encodeURIComponent).join('/');
        await this.connection.request(`/api/contents/${encoded}`, { method: 'DELETE' });
    }
    async rename(path, newPath) {
        const encoded = path.split('/').map(encodeURIComponent).join('/');
        const response = await this.connection.request(`/api/contents/${encoded}`, { method: 'PATCH', body: JSON.stringify({ path: newPath }) });
        return response.json();
    }
}
