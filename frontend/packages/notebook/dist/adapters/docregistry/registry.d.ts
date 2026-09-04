export interface ModelFactory<TModel> {
    readonly name: string;
    readonly contentType: string;
    readonly fileFormat: 'json' | 'text';
    createNew(): TModel;
    createFrom(value: unknown): TModel;
}
export declare class DocumentRegistry {
    private readonly factories;
    registerModelFactory<TModel>(factory: ModelFactory<TModel>): () => void;
    getModelFactory<TModel>(name: string): ModelFactory<TModel> | undefined;
    listModelFactories(): string[];
}
