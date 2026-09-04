import { YNotebook } from '@jupyter/ydoc';
import * as Y from 'yjs';
/** Keeps a NotebookModel and a Yjs SharedNotebook synchronized in both directions. */
export class NotebookCollaboration {
    model;
    shared;
    applyingRemote = false;
    pushingLocal = false;
    localSlot;
    remoteSlot;
    constructor(model, shared = YNotebook.create()) {
        this.model = model;
        this.shared = shared;
        if (shared.cells.length === 0)
            this.pushLocal();
        else
            this.applyRemote();
        this.localSlot = () => {
            if (!this.applyingRemote)
                this.pushLocal();
        };
        this.remoteSlot = () => {
            if (!this.pushingLocal)
                this.applyRemote();
        };
        model.contentChanged.connect(this.localSlot);
        shared.changed.connect(this.remoteSlot);
    }
    applyUpdate(update) { Y.applyUpdate(this.shared.ydoc, update); }
    encodeState() { return Y.encodeStateAsUpdate(this.shared.ydoc); }
    setAwareness(clientId, state) { this.shared.awareness.setLocalStateField(String(clientId), state); }
    dispose() {
        this.model.contentChanged.disconnect(this.localSlot);
        this.shared.changed.disconnect(this.remoteSlot);
    }
    pushLocal() {
        this.pushingLocal = true;
        this.shared.fromJSON(this.model.toJSON());
        this.pushingLocal = false;
    }
    applyRemote() {
        this.applyingRemote = true;
        this.model.fromJSON(this.shared.toJSON());
        this.applyingRemote = false;
    }
}
