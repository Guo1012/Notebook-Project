<script lang="ts">
  import type { NormalizedCell } from '@lumen/nbformat';
  import CellFrame from './CellFrame.svelte';
  import CellToolbar from './CellToolbar.svelte';
  import type { CellToolbarActions } from './types';

  let { cell, showCellToolbar = true, editable = false, onchange = () => undefined, actions = {} }: {
    cell: NormalizedCell;
    showCellToolbar?: boolean;
    editable?: boolean;
    onchange?: (source: string) => void;
    actions?: CellToolbarActions;
  } = $props();
</script>

<CellFrame kind="Raw" showToolbar={showCellToolbar}>
  {#snippet toolbar()}<CellToolbar label="Raw" color="#8b7b67" {...actions} />{/snippet}
  {#if editable}
    <textarea aria-label="Raw cell source" value={cell.source} oninput={event => onchange(event.currentTarget.value)}></textarea>
  {:else}
    <pre>{cell.source}</pre>
  {/if}
</CellFrame>

<style>
  pre, textarea { box-sizing: border-box; width: 100%; min-height: 72px; margin: 0; padding: 16px 20px; white-space: pre-wrap; color: #5d554c; background: #faf8f4; font: 13px/1.65 ui-monospace, monospace; }
  textarea { resize: vertical; border: 0; outline: none; }
</style>
