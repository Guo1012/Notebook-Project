<script lang="ts">
  import type { NotebookModel } from '../adapters/docregistry';
  interface TableOfContentsItem { id: string; cellId: string; text: string; level: number }
  let { model, revision = 0, onselect = () => undefined }: { model: NotebookModel; revision?: number; onselect?: (cellId: string) => void } = $props();
  let items = $derived.by<TableOfContentsItem[]>(() => {
    revision;
    const found: TableOfContentsItem[] = [];
    for (const cell of model.snapshot().cells) {
      if (cell.cell_type !== 'markdown') continue;
      cell.source.split('\n').forEach((line, index) => {
        const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
        if (match) found.push({ id: `${cell.id}-heading-${index}`, cellId: cell.id, text: match[2].replace(/[*_`]/g, ''), level: match[1].length });
      });
    }
    return found;
  });
</script>

<nav class="toc" aria-label="Table of contents">
  <strong>Contents</strong>
  {#if items.length}
    {#each items as item (item.id)}<button style={`padding-left:${8 + (item.level - 1) * 12}px`} onclick={() => onselect(item.cellId)}>{item.text}</button>{/each}
  {:else}<p>No headings</p>{/if}
</nav>

<style>
  .toc { width: 210px; flex: 0 0 210px; padding: 12px 8px; border-right: 1px solid #deddd7; background: #fafaf7; }
  strong { display: block; padding: 0 8px 8px; font: 700 11px system-ui; text-transform: uppercase; letter-spacing: .06em; }
  button { display: block; width: 100%; overflow: hidden; padding-block: 5px; border: 0; background: none; color: #3f4b43; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  button:hover { background: #eef1ec; }
  p { padding: 0 8px; color: #8a8e88; font: 11px system-ui; }
</style>
