<script lang="ts">
  import { TriangleAlert } from '@lucide/svelte';
  import OutputRenderer from './OutputRenderer.svelte';
  import { consolidateOutputs, type OutputAreaModel } from './model.svelte';
  import type { NotebookOutput } from '@lumen/nbformat';

  let {
    outputs = [],
    model = undefined,
    trusted = false,
    scrolled = false
  }: {
    outputs?: NotebookOutput[];
    model?: OutputAreaModel;
    trusted?: boolean;
    scrolled?: boolean;
  } = $props();

  // A model drives the list when provided; otherwise consolidate the raw array.
  const items = $derived(model ? model.items : consolidateOutputs(outputs));

  function isUntrustedRich(output: NotebookOutput): boolean {
    if (trusted || output.output_type === 'stream' || output.output_type === 'error') return false;
    return output.data?.['text/html'] !== undefined || output.data?.['image/svg+xml'] !== undefined;
  }
</script>

{#if items.length}
  <section class="output-area" class:scrolled aria-label="Cell outputs">
    {#each items as output, index (index)}
      <article class="output-item">
        {#if isUntrustedRich(output)}
          <div class="untrusted"><TriangleAlert size={13} /> 未信任：HTML/SVG 输出已降级渲染</div>
        {/if}
        <div class="output-body">
          <OutputRenderer {output} {trusted} />
        </div>
      </article>
    {/each}
  </section>
{/if}

<style>
  .output-area {
    border-top: 1px solid #e5e4df;
  }
  .output-item + .output-item {
    border-top: 1px solid #ecebe5;
  }
  .output-body {
    background: white;
  }
  .output-area.scrolled .output-body {
    max-height: 320px;
    overflow: auto;
  }
  .untrusted {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: #fff7ed;
    color: #a86a3a;
    font: 600 11px system-ui;
    border-bottom: 1px solid #f0e6d8;
  }
</style>
