<script lang="ts">
  import CodeCell from './CodeCell.svelte';
  import MarkdownCell from './MarkdownCell.svelte';
  import RawCell from './RawCell.svelte';
  import CircuitCell from './CircuitCell.svelte';
  import type { CodeEditorDiagnostic, CompletionProvider } from '@lumen/codeeditor';
  import type { NormalizedCell } from '@lumen/nbformat';
  import type { CellToolbarActions } from './types';

  let {
    cell,
    trusted = false,
    showCellToolbar = true,
    editable = false,
    diagnostics = [],
    completionProvider,
    onchange,
    actions
  }: {
    cell: NormalizedCell;
    trusted?: boolean;
    showCellToolbar?: boolean;
    editable?: boolean;
    diagnostics?: CodeEditorDiagnostic[];
    completionProvider?: CompletionProvider;
    index?: number;
    onchange?: (source: string) => void;
    actions?: CellToolbarActions;
  } = $props();
</script>

{#if cell.lumenType === 'circuit'}
  <CircuitCell {cell} {trusted} {showCellToolbar} {actions} />
{:else if cell.cell_type === 'markdown'}
  <MarkdownCell {cell} {trusted} {showCellToolbar} {editable} {onchange} {actions} />
{:else if cell.cell_type === 'raw'}
  <RawCell {cell} {showCellToolbar} {editable} {onchange} {actions} />
{:else}
  <CodeCell {cell} {trusted} {showCellToolbar} {editable} {diagnostics} {completionProvider} {onchange} {actions} />
{/if}
