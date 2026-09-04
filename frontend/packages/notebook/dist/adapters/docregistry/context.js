import { Signal } from '@lumino/signaling';
import { NotebookModel } from './model';
export class DocumentContext {
    path;
    model;
    contents;
    pathChanged = new Signal(this);
    saveStateChanged = new Signal(this);
    constructor(path, model, contents) {
        this.path = path;
        this.model = model;
        this.contents = contents;
    }
    async save() {
        this.saveStateChanged.emit('started');
        try {
            await this.contents.save(this.path, this.model.toJSON());
            this.model.dirty = false;
            this.saveStateChanged.emit('completed');
        }
        catch (error) {
            this.saveStateChanged.emit('failed');
            throw error;
        }
    }
    async revert() {
        const model = await this.contents.get(this.path);
        if (model.type !== 'notebook')
            throw new TypeError(`${this.path} is not a notebook`);
        this.model.fromJSON(model.content);
    }
    async rename(newPath) {
        const renamed = await this.contents.rename(this.path, newPath);
        this.path = renamed.path;
        this.pathChanged.emit(this.path);
    }
}
