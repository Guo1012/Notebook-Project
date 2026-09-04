<script lang="ts">
  import type { StatusItem } from './types';
  let { left = [], right = [], label = 'Notebook status', class: className = '' }: {
    left?: StatusItem[];
    right?: StatusItem[];
    label?: string;
    class?: string;
  } = $props();
</script>

<footer class={`lumen-statusbar ${className}`} aria-label={label}>
  <div>{#each left as item (item.id)}<span title={item.title}>{item.label}</span>{/each}</div>
  <div>{#each right as item (item.id)}<span title={item.title}>{item.label}</span>{/each}</div>
</footer>

<style>
  .lumen-statusbar { box-sizing: border-box; min-height: 26px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 12px; border: 1px solid #deddd7; background: #fafaf7; color: #72766f; font: 10px system-ui, sans-serif; }
  div { display: flex; align-items: center; gap: 12px; min-width: 0; }
  span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
