<script lang="ts">
  import { tick } from 'svelte';
  import { renderMarkdown } from './markdown';
  import { mathTypesetter } from './mathTypesetter';
  import { standardRenderMime, type RenderMimeRegistry } from './registry';
  import type { MimeBundle } from '@lumen/nbformat';

  let { data, trusted = false, registry = standardRenderMime }: { data: MimeBundle; trusted?: boolean; registry?: RenderMimeRegistry } = $props();
  let rendered = $state('');
  let richNode = $state<HTMLElement>();
  let latexNode = $state<HTMLElement>();
  let mimeType = $derived(registry.preferredMimeType(data, trusted));

  const asText = (value: unknown) => Array.isArray(value) ? value.join('') : String(value ?? '');
  const mediaSrc = (mime: string) => `data:${mime};base64,${asText(data[mime])}`;
  const placeholderLabel = $derived(
    mimeType === 'application/vnd.jupyter.widget-view+json' || mimeType === 'application/vnd.jupyter.widget-state+json' ? 'ipywidgets'
    : mimeType === 'application/vnd.plotly.v1+json' ? 'Plotly'
    : mimeType === 'application/vnd.vega.v5+json' ? 'Vega'
    : '交互式输出'
  );

  $effect(() => {
    let active = true;
    const unsafe = data['text/html'] ?? data['image/svg+xml'];
    const markdown = data['text/markdown'];
    void (async () => {
      const DOMPurify = (await import('dompurify')).default;
      let html: string;
      if (unsafe !== undefined) html = DOMPurify.sanitize(asText(unsafe));
      else if (markdown !== undefined) html = await renderMarkdown(asText(markdown), { trusted: false });
      else html = '';
      if (active) rendered = html;
    })();
    return () => { active = false; };
  });

  $effect(() => {
    if (mimeType !== 'text/latex' || !latexNode) return;
    void mathTypesetter.renderLatex(latexNode, asText(data['text/latex']));
  });

  $effect(() => {
    if (!richNode || !rendered) return;
    const node = richNode;
    void tick().then(() => mathTypesetter.typeset(node));
  });
</script>

{#if mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/gif' || mimeType === 'image/webp'}
  <img src={mediaSrc(mimeType)} alt="Notebook output" />
{:else if mimeType === 'application/pdf'}
  <div class="pdf-output">
    <iframe title="PDF 输出" src={mediaSrc('application/pdf')}></iframe>
    <a href={mediaSrc('application/pdf')} target="_blank" rel="noreferrer">在新标签页打开 PDF</a>
  </div>
{:else if mimeType === 'video/mp4' || mimeType === 'video/webm' || mimeType === 'video/ogg'}
  <!-- svelte-ignore a11y_media_has_caption -->
  <video controls src={mediaSrc(mimeType)}></video>
{:else if mimeType === 'audio/mpeg' || mimeType === 'audio/ogg' || mimeType === 'audio/wav'}
  <audio controls src={mediaSrc(mimeType)}></audio>
{:else if mimeType === 'text/html' || mimeType === 'image/svg+xml' || mimeType === 'text/markdown'}
  <div class="rich-output" bind:this={richNode}>{@html rendered}</div>
{:else if mimeType === 'text/latex'}
  <div class="latex" bind:this={latexNode} aria-label="LaTeX output"></div>
{:else if mimeType === 'application/vnd.lumen.circuit+json'}
  <pre class="circuit-json">{JSON.stringify(data[mimeType], null, 2)}</pre>
{:else if mimeType === 'application/vnd.jupyter.widget-view+json' || mimeType === 'application/vnd.jupyter.widget-state+json' || mimeType === 'application/vnd.plotly.v1+json' || mimeType === 'application/vnd.vega.v5+json'}
  <div class="mime-placeholder">
    <span class="placeholder-tag">{placeholderLabel}</span>
    <p>该交互式输出需要真实内核运行，当前环境暂不支持渲染。</p>
  </div>
{:else if mimeType === 'text/plain'}
  <pre>{asText(data['text/plain'])}</pre>
{:else if mimeType === 'application/json' || mimeType === 'application/geo+json'}
  <pre>{JSON.stringify(data[mimeType], null, 2)}</pre>
{/if}

<style>
  pre { min-height: 20px; margin: 0; padding: 11px 18px; white-space: pre-wrap; overflow-wrap: anywhere; color: #28342c; font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; background: white; }
  img { display: block; max-width: 100%; height: auto; padding: 12px 18px; box-sizing: border-box; }
  .rich-output { overflow: auto; padding: 12px 18px; line-height: 1.6; background: white; }
  .rich-output :global(img), .rich-output :global(svg) { max-width: 100%; height: auto; }
  .rich-output :global(pre) { overflow: auto; padding: 10px 12px; border-radius: 6px; background: #f5f5f1; }
  .rich-output :global(table) { border-collapse: collapse; margin: 0; font: 12px ui-monospace, monospace; }
  .rich-output :global(th), .rich-output :global(td) { border: 1px solid #e3e4de; padding: 4px 9px; text-align: right; white-space: nowrap; max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
  .rich-output :global(th) { background: #f4f5f1; color: #55635a; font-weight: 600; }
  .rich-output :global(tbody tr:nth-child(even)) { background: #fafaf7; }
  .latex { overflow-x: auto; padding: 12px 18px; color: #313c35; font: 14px/1.6 Georgia, serif; background: white; }
  video, audio { display: block; max-width: 100%; padding: 12px 18px; box-sizing: border-box; background: white; }
  .pdf-output { padding: 12px 18px; background: white; }
  .pdf-output iframe { display: block; width: 100%; height: 420px; border: 1px solid #e5e4df; border-radius: 6px; background: #fafaf7; }
  .pdf-output a { display: inline-block; margin-top: 8px; font-size: 11px; color: #4f7a52; }
  .mime-placeholder { display: flex; flex-direction: column; gap: 6px; padding: 14px 18px; background: #fafaf7; }
  .placeholder-tag { align-self: flex-start; padding: 2px 8px; border-radius: 999px; background: #eef0ee; color: #6b756c; font: 600 9px ui-monospace, monospace; text-transform: uppercase; letter-spacing: .05em; }
  .mime-placeholder p { margin: 0; color: #8a8d86; font-size: 11px; }
</style>
