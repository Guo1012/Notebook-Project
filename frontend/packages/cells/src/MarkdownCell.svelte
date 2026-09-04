<script lang="ts">
  import { renderMarkdown } from '@lumen/rendermime';
  import type { NormalizedCell } from '@lumen/nbformat';
  import CellFrame from './CellFrame.svelte';
  import CellToolbar from './CellToolbar.svelte';
  import type { CellToolbarActions } from './types';

  let {
    cell,
    trusted = false,
    showCellToolbar = true,
    editable = false,
    onchange = () => undefined,
    actions = {}
  }: {
    cell: NormalizedCell;
    trusted?: boolean;
    showCellToolbar?: boolean;
    editable?: boolean;
    onchange?: (source: string) => void;
    actions?: CellToolbarActions;
  } = $props();

  let html = $state('');
  let textarea = $state<HTMLTextAreaElement | undefined>(undefined);

  function resizeTextarea() {
    const el = textarea;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  $effect(() => {
    let active = true;
    void renderMarkdown(cell.source, { trusted }).then(value => {
      if (active) html = value;
    });
    return () => { active = false; };
  });

  // Re-measure whenever the source changes (typing, undo, AI insert) while editing.
  $effect(() => {
    cell.source;
    if (editable) resizeTextarea();
  });

  $effect(() => {
    if (editable && textarea) {
      textarea.focus();
      const length = textarea.value.length;
      textarea.setSelectionRange(length, length);
      resizeTextarea();
    }
  });
</script>

<CellFrame kind="Markdown" showToolbar={showCellToolbar}>
  {#snippet toolbar()}<CellToolbar label="Markdown" color="#c97759" {...actions} />{/snippet}
  {#if editable}
    <textarea bind:this={textarea} aria-label="Markdown source" value={cell.source} oninput={event => { onchange(event.currentTarget.value); resizeTextarea(); }}></textarea>
  {:else}
    <div class="markdown" role="button" tabindex="0" title="双击编辑" ondblclick={() => actions.onedit?.()} onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); actions.onedit?.(); } }}>{@html html}</div>
  {/if}
</CellFrame>

<style>
  textarea { box-sizing: border-box; width: 100%; min-height: 52px; max-height: 1000px; resize: none; overflow-y: auto; border: 0; padding: 10px 14px; outline: none; font: 11.5px/1.55 ui-monospace, monospace; }
  .markdown { box-sizing: border-box; min-height: 52px; padding: 10px 14px; font-size: 12px; line-height: 1.55; cursor: text; color: #263029; }
  .markdown :global(h1) { font-size: 1.35em; margin: 0.65em 0 0.35em; font-weight: 650; }
  .markdown :global(h2) { font-size: 1.2em; margin: 0.65em 0 0.35em; }
  .markdown :global(h3) { font-size: 1.08em; margin: 0.55em 0 0.25em; }
  .markdown :global(h4), .markdown :global(h5), .markdown :global(h6) { font-size: 1em; margin: 0.6em 0 0.3em; }
  .markdown :global(p) { margin: 0.5em 0; }
  .markdown :global(ul), .markdown :global(ol) { padding-left: 1.4em; margin: 0.5em 0; }
  .markdown :global(li) { margin: 0.2em 0; }
  .markdown :global(code) { font: 11px/1.45 ui-monospace, monospace; background: #eef0eb; padding: 1px 4px; border-radius: 4px; }
  .markdown :global(pre) { background: #f4f3ee; border: 1px solid #e5e4df; border-radius: 8px; padding: 8px 10px; overflow-x: auto; }
  .markdown :global(pre code) { background: none; padding: 0; }
  .markdown :global(blockquote) { margin: 0.6em 0; padding-left: 12px; border-left: 3px solid #deddd5; color: #747970; }
  .markdown :global(a) { color: #506b58; }
  .markdown :global(table) { border-collapse: collapse; margin: 0.6em 0; }
  .markdown :global(th), .markdown :global(td) { border: 1px solid #deddd5; padding: 4px 8px; }
  .markdown :global(img) { max-width: 100%; }
</style>
