import type { NotebookModel } from '../adapters/docregistry';
type $$ComponentProps = {
    model: NotebookModel;
    revision?: number;
    onselect?: (cellId: string) => void;
};
declare const TableOfContents: import("svelte").Component<$$ComponentProps, {}, "">;
type TableOfContents = ReturnType<typeof TableOfContents>;
export default TableOfContents;
