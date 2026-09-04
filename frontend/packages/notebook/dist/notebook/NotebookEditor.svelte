<script lang="ts">
  import { onMount } from 'svelte';
  import { Braces, CircuitBoard, FileText } from '@lucide/svelte';
  import { CellRenderer, type CellToolbarActions } from '@lumen/cells';
  import type { CodeEditorDiagnostic, CompletionProvider } from '@lumen/codeeditor';
  import type { NotebookModel } from '../adapters/docregistry';
  import type { SessionContext } from '../adapters/services';
  import { KernelStatus, StatusBar, Toolbar, type StatusItem, type ToolbarItem } from '@lumen/ui-components';
  import NotebookSearch from './NotebookSearch.svelte';
  import TableOfContents from './TableOfContents.svelte';
  import { NotebookController, type NotebookMode } from './NotebookController';
  import type { CellDiagnostic } from '../integrations/NotebookLspAdapter';
  import type { NotebookLspAdapter } from '../integrations/NotebookLspAdapter';

  let {
    model, session, controller: externalController, lsp, trusted = false, showToolbar = true, showStatusBar = true, showTableOfContents = false,
    searchOpen = $bindable(false),
    onsave = () => undefined, onselect = () => undefined, class: className = ''
  }: {
    model: NotebookModel; session?: SessionContext; controller?: NotebookController; lsp?: NotebookLspAdapter; trusted?: boolean; showToolbar?: boolean; showStatusBar?: boolean;
    showTableOfContents?: boolean; searchOpen?: boolean; onsave?: () => void | Promise<void>; onselect?: (cellId: string | null) => void; class?: string;
  } = $props();
  // The editor owns one controller for the lifetime of the supplied model when one is not provided.
  // svelte-ignore state_referenced_locally
  const controller = externalController ?? new NotebookController(model, session);
  let revision = $state(0);
  let selectedId = $state(controller.selectedCellId);
  let selectedIds = $state<string[]>(controller.selectedIds);
  let mode = $state<NotebookMode>(controller.mode);
  let lspDiagnostics = $state<Record<string, CodeEditorDiagnostic[]>>({});
  let notebookDocument = $derived.by(() => { revision; return model.snapshot(); });
  let toolbarItems = $derived.by<ToolbarItem[]>(() => { revision; return [
    { id: 'code', label: '+ Code', group: 'insert', run: () => { controller.insert('code'); } },
    { id: 'markdown', label: '+ Markdown', group: 'insert', run: () => { controller.insert('markdown'); } },
    { id: 'raw', label: '+ Raw', group: 'insert', run: () => { controller.insert('raw'); } },
    { id: 'circuit', label: '+ Circuit', group: 'insert', run: () => { controller.insert('circuit'); } },
    { id: 'run', label: 'Run', group: 'execute', kind: 'primary', disabled: !session, run: () => controller.runSelected() },
    { id: 'run-all', label: 'Run All', group: 'execute', disabled: !session, run: () => controller.runAll() },
    { id: 'stop', label: 'Stop', group: 'execute', kind: 'danger', disabled: !session, run: () => session?.interrupt() },
    { id: 'restart', label: 'Restart', group: 'execute', disabled: !session, run: () => session?.restart() },
    { id: 'up', label: '↑ Cell', group: 'cell', run: () => { controller.moveSelected(-1); } },
    { id: 'down', label: '↓ Cell', group: 'cell', run: () => { controller.moveSelected(1); } },
    { id: 'delete', label: 'Delete', group: 'cell', kind: 'danger', disabled: model.cells.length <= 1, run: () => { controller.deleteSelected(); } },
    { id: 'undo', label: 'Undo', group: 'history', disabled: !model.canUndo, run: () => { model.undo(); } },
    { id: 'redo', label: 'Redo', group: 'history', disabled: !model.canRedo, run: () => { model.redo(); } },
    { id: 'find', label: 'Find', group: 'document', active: searchOpen, run: () => { searchOpen = !searchOpen; } },
    { id: 'save', label: model.dirty ? 'Save •' : 'Save', group: 'document', disabled: !model.dirty, run: onsave }
  ]; });
  let statusRight = $derived.by<StatusItem[]>(() => { revision; return [
    { id: 'cell', label: selectedId ? `${model.getCell(selectedId)?.cell_type.toUpperCase() ?? ''} CELL` : 'NO CELL' },
    { id: 'count', label: `${model.cells.length} Cells` },
    { id: 'dirty', label: model.dirty ? 'Modified' : 'Saved' }
  ]; });

  onMount(() => {
    const onContent = () => revision += 1;
    const onDirty = () => revision += 1;
    const onSelection = (_sender: NotebookController, id: string | null) => {
      selectedId = id;
      selectedIds = controller.selectedIds.slice();
      onselect(id);
      if (id) requestAnimationFrame(() => globalThis.document?.getElementById(`lumen-${id}`)?.scrollIntoView({ block: 'nearest' }));
    };
    const onMode = (_sender: NotebookController, next: NotebookMode) => { mode = next; };
    const onRunning = () => revision += 1;
    const onHistory = () => revision += 1;
    const onDiagnostics = (_sender: NotebookLspAdapter, items: CellDiagnostic[]) => setDiagnostics(items);
    model.contentChanged.connect(onContent);
    model.dirtyChanged.connect(onDirty);
    controller.selectionChanged.connect(onSelection);
    controller.modeChanged.connect(onMode);
    controller.runningChanged.connect(onRunning);
    model.historyChanged.connect(onHistory);
    lsp?.diagnosticsChanged.connect(onDiagnostics);
    if (lsp) void lsp.connect().catch(() => undefined);
    return () => {
      model.contentChanged.disconnect(onContent);
      model.dirtyChanged.disconnect(onDirty);
      controller.selectionChanged.disconnect(onSelection);
      controller.modeChanged.disconnect(onMode);
      controller.runningChanged.disconnect(onRunning);
      model.historyChanged.disconnect(onHistory);
      lsp?.diagnosticsChanged.disconnect(onDiagnostics);
    };
  });

  function setDiagnostics(items: CellDiagnostic[]): void {
    const next: Record<string, CodeEditorDiagnostic[]> = {};
    for (const item of items) {
      (next[item.cellId] ??= []).push({
        start: item.range.start, end: item.range.end, message: item.message, source: item.source,
        severity: item.severity === 1 ? 'error' : item.severity === 2 ? 'warning' : 'info'
      });
    }
    lspDiagnostics = next;
  }

  function completionProvider(cellId: string): CompletionProvider | undefined {
    if (!lsp) return undefined;
    return async request => (await lsp.completion(cellId, { line: request.line, character: request.character })).map(item => ({ label: item.label, detail: item.detail, insertText: item.insertText }));
  }

  function actionsFor(cell: { id: string }, index: number): CellToolbarActions {
    return {
      running: controller.runningCellId === cell.id,
      canMoveUp: index > 0,
      canMoveDown: index < model.cells.length - 1,
      onrun: () => { void controller.runCell(cell.id); },
      onmoveup: () => { controller.moveCell(cell.id, -1); },
      onmovedown: () => { controller.moveCell(cell.id, 1); },
      onedit: () => { controller.select(cell.id); controller.enterEdit(); },
      onduplicate: () => { controller.duplicateCell(cell.id); },
      oncut: () => { controller.cutCell(cell.id); },
      ondelete: () => { controller.deleteCell(cell.id); },
      onclearoutputs: () => { controller.clearOutputs(cell.id); }
    };
  }

  function keydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); searchOpen = true; return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void onsave(); return; }
    controller.handleKeydown(event);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<section class={`lumen-notebook-editor ${className}`} class:mode-command={mode === 'command'} class:mode-edit={mode === 'edit'} aria-label="Notebook editor" role="application" tabindex="0" onkeydown={keydown}>
  {#if showToolbar}<Toolbar items={toolbarItems} />{/if}
  {#if searchOpen}<NotebookSearch {model} onselect={(id) => controller.select(id)} onclose={() => searchOpen = false} />{/if}
  <div class="workspace">
    {#if showTableOfContents}<TableOfContents {model} {revision} onselect={(id) => controller.select(id)} />{/if}
    <main>
      {#each notebookDocument.cells as cell, index (cell.id)}
        <div id={`lumen-${cell.id}`} class="cell-slot" class:selected={selectedId === cell.id || selectedIds.includes(cell.id)} role="presentation" onclick={(event) => controller.select(cell.id, event)}>
          <CellRenderer {cell} {index} {trusted} editable={mode === 'edit' && selectedId === cell.id} actions={actionsFor(cell, index)} diagnostics={lspDiagnostics[cell.id] ?? []} completionProvider={completionProvider(cell.id)} onchange={source => model.updateSource(cell.id, source)} />
        </div>
        <div class="cell-insert" aria-label="插入单元格">
          <button class="code" aria-label="添加代码单元" title="代码单元" onclick={() => controller.insert('code', cell.id, 'after')}><Braces size={13} /> + Code</button>
          <button class="markdown" aria-label="添加 Markdown 单元" title="Markdown 单元" onclick={() => controller.insert('markdown', cell.id, 'after')}><FileText size={13} /> + Markdown</button>
          <button class="circuit" aria-label="添加 Circuit 单元" title="Circuit 单元" onclick={() => controller.insert('circuit', cell.id, 'after')}><CircuitBoard size={13} /> + Circuit</button>
        </div>
      {/each}
    </main>
  </div>
  {#if showStatusBar}
    <div class="status"><div>{#if session}<KernelStatus source={session} />{:else}<span>No kernel</span>{/if}</div><StatusBar left={[{ id: 'format', label: `nbformat ${model.nbformat}.${model.nbformatMinor}` }]} right={statusRight} /></div>
  {/if}
</section>

<style>
  .lumen-notebook-editor { display: flex; min-height: 360px; flex-direction: column; overflow: hidden; border: 1px solid #d8d7d0; border-radius: 12px; background: #fbfaf6; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  .lumen-notebook-editor:focus { outline: 2px solid #c5d6c8; outline-offset: 2px; }
  .workspace { min-height: 0; display: flex; flex: 1; }
  main { min-width: 0; flex: 1; overflow: auto; padding: 12px 14px; }
  .cell-slot { border-radius: 10px; }
  .cell-slot.selected { box-shadow: 0 0 0 2px #829e88; }
  .cell-insert { height: 36px; display: flex; align-items: center; justify-content: center; gap: 6px; opacity: 0; pointer-events: none; transition: opacity .15s; }
  .cell-slot:hover + .cell-insert, .cell-insert:hover, .cell-insert:focus-within { opacity: 1; pointer-events: auto; }
  .cell-insert button { height: 26px; display: flex; align-items: center; gap: 5px; padding: 0 10px; border: 1px solid #deddd5; border-radius: 999px; background: white; color: #263029; font: 600 10px system-ui; cursor: pointer; box-shadow: 0 1px 3px #28302408; }
  .cell-insert button:hover { border-color: #b7b8b0; background: #ecebe4; }
  .cell-insert button.code { color: #557461; }
  .cell-insert button.markdown { color: #a65f49; }
  .cell-insert button.circuit { color: #6b5f8a; }
  .status { position: relative; }.status > div:first-child { position: absolute; z-index: 1; top: 6px; left: 12px; }.status :global(.lumen-statusbar) { padding-left: 190px; border-width: 1px 0 0; }
</style>
