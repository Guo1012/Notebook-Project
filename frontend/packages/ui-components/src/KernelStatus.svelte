<script lang="ts">
  import { onMount } from 'svelte';
  import type { KernelStatusState, KernelStatusSource } from './types';

  let { source, compact = false, messages = {} }: { source: KernelStatusSource; compact?: boolean; messages?: Partial<Record<KernelStatusState, string>> } = $props();
  let status = $state<KernelStatusState>('unknown');
  const labels = $derived<Record<KernelStatusState, string>>({
    unknown: 'Unknown', starting: 'Starting', idle: 'Idle', busy: 'Busy',
    restarting: 'Restarting', dead: 'Dead', ...messages
  });

  onMount(() => {
    const dispose = source.subscribe(next => status = next);
    return typeof dispose === 'function' ? dispose : undefined;
  });
</script>

<span class={`lumen-kernel-status ${status}`} title={`${source.kernelDisplayName}: ${labels[status]}`}>
  <i aria-hidden="true"></i>
  {#if !compact}<span>{source.kernelDisplayName}</span>{/if}
  <b>{labels[status]}</b>
</span>

<style>
  .lumen-kernel-status { display: inline-flex; align-items: center; gap: 6px; color: #718d79; font: 10px system-ui, sans-serif; white-space: nowrap; }
  i { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
  span span { max-width: 160px; overflow: hidden; text-overflow: ellipsis; color: #6f746f; }
  b { font-size: 10px; }
  .busy, .starting, .restarting { color: #b57a42; }
  .dead { color: #a54f42; }
  .unknown { color: #999; }
</style>
