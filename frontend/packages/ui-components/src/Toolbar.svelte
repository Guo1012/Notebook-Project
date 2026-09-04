<script lang="ts">
  import type { ToolbarItem } from './types';

  let { items, label = 'Notebook toolbar', class: className = '' }: {
    items: ToolbarItem[];
    label?: string;
    class?: string;
  } = $props();

  function separated(index: number): boolean {
    return index > 0 && items[index - 1]?.group !== items[index]?.group;
  }
</script>

<header class={`lumen-toolbar ${className}`} aria-label={label}>
  {#each items as item, index (item.id)}
    {#if separated(index)}<span class="separator" aria-hidden="true"></span>{/if}
    <button
      type="button"
      class:primary={item.kind === 'primary'}
      class:danger={item.kind === 'danger'}
      class:active={item.active}
      disabled={item.disabled}
      title={item.title ?? item.label}
      onclick={() => item.run()}
    >{item.label}</button>
  {/each}
</header>

<style>
  .lumen-toolbar { box-sizing: border-box; min-height: 44px; display: flex; align-items: center; gap: 5px; overflow-x: auto; padding: 7px 10px; border: 1px solid #deddd7; background: #fff; }
  button { flex: 0 0 auto; height: 29px; padding: 0 10px; border: 1px solid #d8d7d1; border-radius: 7px; background: #fff; color: #29322d; font: 600 11px system-ui, sans-serif; cursor: pointer; }
  button:hover:not(:disabled) { border-color: #aeb4ad; background: #f7f7f3; }
  button.primary { border-color: #557461; background: #557461; color: white; }
  button.danger { color: #a54f42; }
  button.active { box-shadow: inset 0 0 0 1px #557461; background: #edf4ee; color: #45644f; }
  button:disabled { opacity: .45; cursor: default; }
  .separator { width: 1px; height: 20px; flex: 0 0 1px; margin: 0 3px; background: #deddd7; }
</style>
