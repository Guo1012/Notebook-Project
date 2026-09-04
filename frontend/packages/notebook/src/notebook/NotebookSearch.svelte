<script lang="ts">
  import type { NotebookModel } from '../adapters/docregistry';

  interface SearchMatch { cellId: string; cellIndex: number; start: number; end: number; text: string }

  let { model, onselect = () => undefined, onclose = () => undefined }: {
    model: NotebookModel;
    onselect?: (cellId: string) => void;
    onclose?: () => void;
  } = $props();
  let query = $state('');
  let replacement = $state('');
  let caseSensitive = $state(false);
  let regex = $state(false);
  let revision = $state(0);
  let active = $state(0);
  let matches = $derived.by<SearchMatch[]>(() => { revision; return findMatches(); });

  function findMatches(): SearchMatch[] {
    if (!query) return [];
    const escaped = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
    const found: SearchMatch[] = [];
    model.snapshot().cells.forEach((cell, cellIndex) => {
      expression.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = expression.exec(cell.source))) {
        found.push({ cellId: cell.id, cellIndex, start: match.index, end: match.index + match[0].length, text: match[0] });
        if (!match[0]) expression.lastIndex += 1;
      }
    });
    return found;
  }

  function search(): void {
    revision += 1;
    active = Math.min(active, Math.max(0, matches.length - 1));
  }
  function select(index: number): void {
    if (!matches.length) return;
    active = (index + matches.length) % matches.length;
    onselect(matches[active].cellId);
  }
  function replaceOne(): void {
    const match = matches[Math.min(active, Math.max(0, matches.length - 1))];
    if (!match) return;
    const source = model.getCell(match.cellId)?.source ?? '';
    model.updateSource(match.cellId, `${source.slice(0, match.start)}${replacement}${source.slice(match.end)}`);
    search();
  }
  function replaceAll(): void {
    const byCell = new Map<string, SearchMatch[]>();
    for (const match of matches) byCell.set(match.cellId, [...(byCell.get(match.cellId) ?? []), match]);
    for (const [cellId, cellMatches] of byCell) {
      let source = model.getCell(cellId)?.source ?? '';
      for (const match of cellMatches.sort((a, b) => b.start - a.start)) source = `${source.slice(0, match.start)}${replacement}${source.slice(match.end)}`;
      model.updateSource(cellId, source);
    }
    search();
  }
</script>

<div class="search" role="search">
  <input aria-label="Find" placeholder="Find in notebook" bind:value={query} />
  <button class:active={caseSensitive} title="Match case" onclick={() => caseSensitive = !caseSensitive}>Aa</button>
  <button class:active={regex} title="Regular expression" onclick={() => regex = !regex}>.*</button>
  <span>{matches.length ? `${Math.min(active + 1, matches.length)}/${matches.length}` : '0/0'}</span>
  <button onclick={() => select(active - 1)}>↑</button><button onclick={() => select(active + 1)}>↓</button>
  <input aria-label="Replace" placeholder="Replace" bind:value={replacement} />
  <button disabled={!matches.length} onclick={replaceOne}>Replace</button>
  <button disabled={!matches.length} onclick={replaceAll}>All</button>
  <button aria-label="Close search" onclick={onclose}>×</button>
</div>

<style>
  .search { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; padding: 7px 10px; border: 1px solid #deddd7; border-top: 0; background: #fafaf7; font: 11px system-ui; }
  input { height: 27px; min-width: 150px; padding: 0 8px; border: 1px solid #d8d7d1; border-radius: 5px; }
  button { height: 27px; border: 1px solid #d8d7d1; border-radius: 5px; background: #fff; cursor: pointer; }
  button.active { border-color: #557461; background: #edf4ee; }
  button:disabled { opacity: .45; }
</style>
