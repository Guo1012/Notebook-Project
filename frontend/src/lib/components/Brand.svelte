<script lang="ts">
  import { Orbit } from '@lucide/svelte';
  let { compact = false }: { compact?: boolean } = $props();
</script>

<a class:compact href="/" aria-label="返回首页">
  <span class="mark"><Orbit size={19} strokeWidth={1.8} /></span>
  {#if !compact}<span>Lumen</span>{/if}
</a>

<style>
  a { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; font-family: var(--font-display); font-size: 20px; font-weight: 700; letter-spacing: -.04em; }
  .mark { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; color: white; background: var(--ink); box-shadow: 0 4px 12px #18211b22; }
  .compact .mark { width: 32px; height: 32px; }
</style>
