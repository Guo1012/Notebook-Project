export class DocumentRegistry {
    factories = new Map();
    registerModelFactory(factory) {
        if (this.factories.has(factory.name))
            throw new Error(`Model factory already registered: ${factory.name}`);
        this.factories.set(factory.name, factory);
        return () => this.factories.delete(factory.name);
    }
    getModelFactory(name) {
        return this.factories.get(name);
    }
    listModelFactories() { return [...this.factories.keys()]; }
}
