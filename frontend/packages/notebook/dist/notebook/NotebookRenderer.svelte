<script lang="ts">
  import { CellRenderer } from '@lumen/cells';
  import { parseNotebook, type NotebookDocument } from '@lumen/nbformat';
  let { notebook, trusted = false, showCellToolbar = true, editable = false, onchange, class: className = '' }: { notebook: NotebookDocument | string; trusted?: boolean; showCellToolbar?: boolean; editable?: boolean; onchange?: (cellId: string, source: string) => void; class?: string } = $props();
  let document = $derived(parseNotebook(notebook));
</script>

<section class={`lumen-notebook ${className}`} aria-label="Jupyter Notebook">
  {#each document.cells as cell, index (cell.id)}<CellRenderer {cell} {index} {trusted} {showCellToolbar} {editable} onchange={source => onchange?.(cell.id, source)} />{/each}
</section>

<style>.lumen-notebook { box-sizing: border-box; width: 100%; padding: 18px; border: 1px solid #d8d7d0; border-radius: 14px; background: #fbfaf6; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }</style>
