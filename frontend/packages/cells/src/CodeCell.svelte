<script lang="ts">
  import { Check, ChevronDown, Copy, Eraser } from '@lucide/svelte';
  import { CodeEditor, type CodeEditorDiagnostic, type CompletionProvider } from '@lumen/codeeditor';
  import { OutputArea } from '@lumen/outputarea';
  import type { NormalizedCell, NotebookOutput } from '@lumen/nbformat';
  import CellFrame from './CellFrame.svelte';
  import CellToolbar from './CellToolbar.svelte';
  import type { CellToolbarActions } from './types';

  let {
    cell,
    trusted = false,
    showCellToolbar = true,
    editable = false,
    diagnostics = [],
    completionProvider,
    onchange = () => undefined,
    actions = {}
  }: {
    cell: NormalizedCell;
    trusted?: boolean;
    showCellToolbar?: boolean;
    editable?: boolean;
    diagnostics?: CodeEditorDiagnostic[];
    completionProvider?: CompletionProvider;
    onchange?: (source: string) => void;
    actions?: CellToolbarActions;
  } = $props();

  let collapsed = $state(false);
  let copied = $state(false);

  function textOf(value: string | string[]): string {
    return Array.isArray(value) ? value.join('') : value;
  }

  function outputText(output: NotebookOutput): string {
    if (output.output_type === 'stream') return textOf(output.text);
    if (output.output_type === 'error') return output.traceback?.join('\n') || `${output.ename}: ${output.evalue}`;
    const data = output.data ?? {};
    if (data['text/plain'] !== undefined) return textOf(data['text/plain'] as string | string[]);
    if (data['application/json'] !== undefined) return JSON.stringify(data['application/json'], null, 2);
    return '';
  }

  async function copyAllOutputs() {
    const text = (cell.outputs ?? []).map(outputText).filter(Boolean).join('\n');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => { copied = false; }, 1500);
    } catch {
      // clipboard unavailable in this context; ignore silently.
    }
  }
</script>

<CellFrame kind="Code" executionCount={cell.execution_count} showToolbar={showCellToolbar}>
  {#snippet toolbar()}<CellToolbar label="Python" color="#6f9478" {...actions} />{/snippet}
  <div class="editor-row">
    <span class="prompt">In [{cell.execution_count ?? ' '}]:</span>
    <CodeEditor value={cell.source} compact readOnly={!editable} autofocus {diagnostics} {completionProvider} onchange={onchange} />
  </div>
  {#snippet outputs()}
    {#if cell.outputs?.length}
      <div class="output-row">
        <span class="prompt out">Out [{cell.execution_count ?? ' '}]:</span>
        <div class="outputs-wrap">
          <div class="output-toolbar">
            <button class="out-toggle" class:collapsed aria-label={collapsed ? '展开输出' : '折叠输出'} title={collapsed ? '展开输出' : '折叠输出'} onclick={() => collapsed = !collapsed}><ChevronDown size={13} /></button>
            <div class="out-actions">
              <button class="out-copy" class:done={copied} aria-label="复制输出" title="复制输出" onclick={copyAllOutputs}>{#if copied}<Check size={12} /> 已复制{:else}<Copy size={12} /> 复制{/if}</button>
              {#if actions.onclearoutputs}<button class="out-clear" aria-label="清除输出" title="清除输出" onclick={actions.onclearoutputs}><Eraser size={12} /> 清除输出</button>{/if}
            </div>
          </div>
          {#if !collapsed}<OutputArea outputs={cell.outputs} {trusted} scrolled />{/if}
        </div>
      </div>
    {/if}
  {/snippet}
</CellFrame>

<style>
  .editor-row { display: grid; grid-template-columns: 58px minmax(0, 1fr); align-items: start; }
  .prompt { padding: 12px 10px 0 0; text-align: right; color: #506b58; font: 10px ui-monospace, monospace; white-space: nowrap; user-select: none; }
  .prompt.out { color: #a54f42; }
  .output-row { display: grid; grid-template-columns: 58px minmax(0, 1fr); align-items: start; border-top: 1px solid #e5e4df; }
  .outputs-wrap { min-width: 0; }
  .outputs-wrap :global(.output-area) { border-top: 0; }
  .output-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 5px 10px; border-bottom: 1px solid #ecebe5; }
  .out-actions { display: flex; align-items: center; gap: 6px; }
  .output-toolbar button { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 7px; border: 1px solid #deddd5; border-radius: 6px; background: #fbfbf8; color: #747970; font: 600 9px system-ui; cursor: pointer; }
  .output-toolbar button:hover { background: #ecebe4; color: #18211b; }
  .out-toggle { transition: transform .16s ease; }
  .out-toggle.collapsed { transform: rotate(-90deg); }
  .out-copy.done { background: #e9efe9; border-color: #c6d5c7; color: #4f7a52; }
  .out-clear:hover { background: #fff0ed; color: #a54f42; }
</style>
