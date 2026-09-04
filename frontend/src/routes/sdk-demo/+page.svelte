<script lang="ts">
  import { MockKernel, NotebookEditor, NotebookModel, SessionContext } from '@lumen/notebook';

  const model = new NotebookModel({
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' } },
    cells: [
      { id: 'intro', cell_type: 'markdown', metadata: {}, source: '# Lumen Notebook SDK\n\n这是由 `@lumen/notebook` 独立渲染和编辑的 `.ipynb`。' },
      { id: 'code', cell_type: 'code', metadata: {}, source: 'print("Hello from @lumen/notebook")', execution_count: null, outputs: [] },
      { id: 'circuit', cell_type: 'code', metadata: { lumen: { cell_type: 'circuit', circuit: { version: 1, wires: 2, gates: [{ id: 'h', type: 'h', wire: 0, column: 0 }, { id: 'cx', type: 'x', wire: 1, column: 1, controls: [0] }] } } }, source: '', execution_count: null, outputs: [] }
    ]
  });
  const session = new SessionContext(new MockKernel());
  let savedAt = $state('');
  function save(): void { model.dirty = false; savedAt = new Date().toLocaleTimeString(); }
</script>

<svelte:head><title>Lumen Notebook SDK Demo</title></svelte:head>

<div class="page">
  <header><p>@lumen/notebook</p><h1>SDK integration demo</h1><span>Agent is intentionally outside this package.</span></header>
  <NotebookEditor {model} {session} showTableOfContents onsave={save} />
  {#if savedAt}<p class="saved">Saved locally at {savedAt}</p>{/if}
</div>

<style>
  :global(body) { margin: 0; background: #f1f0e9; color: #28302b; }
  .page { max-width: 1120px; min-height: 100vh; margin: auto; padding: 28px; box-sizing: border-box; }
  header { margin-bottom: 18px; }header p { margin: 0; color: #557461; font: 700 11px system-ui; text-transform: uppercase; letter-spacing: .08em; }h1 { margin: 4px 0; font: 650 28px system-ui; }header span,.saved { color: #71766f; font: 12px system-ui; }.saved { text-align: right; }
</style>
