import { LspClient } from '../adapters/lsp';
import { Signal } from '@lumino/signaling';
/** Presents code cells as one virtual LSP document and maps positions back to cells. */
export class NotebookLspAdapter {
    model;
    client;
    uri;
    languageId;
    diagnosticsChanged = new Signal(this);
    version = 0;
    opened = false;
    ranges = [];
    changeTimer;
    modelSlot;
    diagnosticSlot;
    constructor(model, client, uri, languageId = 'python') {
        this.model = model;
        this.client = client;
        this.uri = uri;
        this.languageId = languageId;
        this.modelSlot = () => this.scheduleChange();
        this.diagnosticSlot = (_sender, value) => {
            if (value.uri === this.uri)
                this.diagnosticsChanged.emit(value.diagnostics.flatMap(item => this.fromVirtualDiagnostic(item)));
        };
        model.contentChanged.connect(this.modelSlot);
        client.diagnostics.connect(this.diagnosticSlot);
    }
    async connect(rootUri) {
        await this.client.connect();
        await this.client.request('initialize', { processId: null, rootUri: rootUri ?? null, capabilities: { textDocument: { completion: {}, hover: {}, publishDiagnostics: {} } } });
        this.client.notify('initialized', {});
        const text = this.virtualDocument();
        this.client.notify('textDocument/didOpen', { textDocument: { uri: this.uri, languageId: this.languageId, version: this.version, text } });
        this.opened = true;
    }
    async completion(cellId, position) {
        const result = await this.client.request('textDocument/completion', {
            textDocument: { uri: this.uri }, position: this.toVirtualPosition(cellId, position)
        });
        return Array.isArray(result) ? result : result?.items ?? [];
    }
    hover(cellId, position) {
        return this.client.request('textDocument/hover', { textDocument: { uri: this.uri }, position: this.toVirtualPosition(cellId, position) });
    }
    dispose() {
        if (this.changeTimer)
            clearTimeout(this.changeTimer);
        if (this.opened)
            this.client.notify('textDocument/didClose', { textDocument: { uri: this.uri } });
        this.model.contentChanged.disconnect(this.modelSlot);
        this.client.diagnostics.disconnect(this.diagnosticSlot);
    }
    scheduleChange() {
        if (!this.opened)
            return;
        if (this.changeTimer)
            clearTimeout(this.changeTimer);
        this.changeTimer = setTimeout(() => {
            this.version += 1;
            this.client.notify('textDocument/didChange', { textDocument: { uri: this.uri, version: this.version }, contentChanges: [{ text: this.virtualDocument() }] });
        }, 120);
    }
    virtualDocument() {
        const parts = [];
        this.ranges = [];
        let line = 0;
        for (const cell of this.model.snapshot().cells) {
            if (cell.cell_type !== 'code' || cell.lumenType === 'circuit')
                continue;
            const marker = `# %% [${cell.id}]`;
            parts.push(marker, cell.source);
            const length = cell.source.split('\n').length;
            this.ranges.push({ cellId: cell.id, startLine: line + 1, endLine: line + length });
            line += length + 1;
        }
        return parts.join('\n');
    }
    toVirtualPosition(cellId, position) {
        const range = this.ranges.find(item => item.cellId === cellId);
        if (!range)
            throw new Error(`Cell is not part of the LSP document: ${cellId}`);
        return { line: range.startLine + position.line, character: position.character };
    }
    fromVirtualDiagnostic(diagnostic) {
        const range = this.ranges.find(item => diagnostic.range.start.line >= item.startLine && diagnostic.range.start.line <= item.endLine);
        if (!range)
            return [];
        return [{ ...diagnostic, cellId: range.cellId, range: {
                    start: { ...diagnostic.range.start, line: diagnostic.range.start.line - range.startLine },
                    end: { ...diagnostic.range.end, line: Math.max(0, diagnostic.range.end.line - range.startLine) }
                } }];
    }
}
