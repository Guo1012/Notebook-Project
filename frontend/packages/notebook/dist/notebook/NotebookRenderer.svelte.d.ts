import { type NotebookDocument } from '@lumen/nbformat';
type $$ComponentProps = {
    notebook: NotebookDocument | string;
    trusted?: boolean;
    showCellToolbar?: boolean;
    editable?: boolean;
    onchange?: (cellId: string, source: string) => void;
    class?: string;
};
declare const NotebookRenderer: import("svelte").Component<$$ComponentProps, {}, "">;
type NotebookRenderer = ReturnType<typeof NotebookRenderer>;
export default NotebookRenderer;
