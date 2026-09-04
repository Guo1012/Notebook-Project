import type { NotebookModel } from '../adapters/docregistry';
type $$ComponentProps = {
    model: NotebookModel;
    onselect?: (cellId: string) => void;
    onclose?: () => void;
};
declare const NotebookSearch: import("svelte").Component<$$ComponentProps, {}, "">;
type NotebookSearch = ReturnType<typeof NotebookSearch>;
export default NotebookSearch;
