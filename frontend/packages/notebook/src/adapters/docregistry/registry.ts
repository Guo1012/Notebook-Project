export interface ModelFactory<TModel> {
  readonly name: string;
  readonly contentType: string;
  readonly fileFormat: 'json' | 'text';
  createNew(): TModel;
  createFrom(value: unknown): TModel;
}

export class DocumentRegistry {
  private readonly factories = new Map<string, ModelFactory<unknown>>();
  registerModelFactory<TModel>(factory: ModelFactory<TModel>): () => void {
    if (this.factories.has(factory.name)) throw new Error(`Model factory already registered: ${factory.name}`);
    this.factories.set(factory.name, factory as ModelFactory<unknown>);
    return () => this.factories.delete(factory.name);
  }
  getModelFactory<TModel>(name: string): ModelFactory<TModel> | undefined {
    return this.factories.get(name) as ModelFactory<TModel> | undefined;
  }
  listModelFactories(): string[] { return [...this.factories.keys()]; }
}
