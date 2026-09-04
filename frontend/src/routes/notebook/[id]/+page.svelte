<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { ArrowLeft, BookOpen, Braces, ChevronDown, ChevronRight, CircuitBoard, Copy, Download, FileText, Folder, GripVertical, List, ListChecks, ListTree, MoreHorizontal, Pencil, Play, Plus, RotateCw, Search, Sparkles, Square, Text, Trash2, Upload } from '@lucide/svelte';
  import { NotebookController, NotebookEditor, NotebookModel as EditorNotebookModel } from '@lumen/notebook';
  import { KernelStatus } from '@lumen/ui-components';
  import { AgentChat, AgentChatModel, type AgentContext } from '@lumen/ai-chat';
  import AiPet from '$lib/components/AiPet.svelte';
  import { NotebookModel as StoredNotebookModel } from '$lib/notebookModel';
  import type { SessionContext } from '$lib/sessionContext';
  import { notebookSessions } from '$lib/notebookSessions';
  import { cellLabel, createCell, createNotebook, deleteNotebook, duplicateNotebook, exportNotebook, getNotebook, getNotebooks, importNotebook, notebookDownloadName, renameNotebook, saveNotebook } from '$lib/notebooks';
  import { listFiles, uploadFiles, type UploadedFile } from '$lib/files';
  import type { CellType, Notebook, NotebookCell, NotebookJSON } from '$lib/types';

  let notebook = $state<Notebook | null>(null);
  let editorModel = $state<EditorNotebookModel | null>(null);
  let editorController = $state<NotebookController | null>(null);
  let searchOpen = $state(false);
  let runMenuOpen = $state(false);
  let notebooks = $state<Notebook[]>([]);
  let selectedId = $state('');
  let panelMode = $state<'list' | 'folders'>('list');
  let panelCollapsed = $state(false);
  let editorOutlineOpen = $state(true);
  let aiOpen = $state(false);
  let aiPlacement = $state<'right' | 'bottom'>('right');
  let aiHeight = $state(320);
  let aiWidth = $state(340);
  let sidebarWidth = $state(248);
  let saved = $state(true);
  let dragId = $state<string | null>(null);
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let saveInFlight = false;
  let saveAgain = false;
  let changeVersion = 0;
  let listQuery = $state('');
  let activeNotebookMenu = $state<string | null>(null);
  let activeCellMenu = $state<string | null>(null);
  let renamingNotebookId = $state<string | null>(null);
  let renamingCellId = $state<string | null>(null);
  let renameValue = $state('');
  let importInput: HTMLInputElement;
  let fileUploadInput: HTMLInputElement;
  let uploadedFiles = $state<UploadedFile[]>([]);
  let fileNotice = $state<{ kind: 'success' | 'error'; text: string } | null>(null);
  const agentChatModel = new AgentChatModel();
  let sessionContext = $state<SessionContext | null>(null);
  let filteredNotebooks = $derived(notebooks.filter((n) => n.title.toLowerCase().includes(listQuery.toLowerCase())));
  let selectedCell = $derived(notebook?.cells.find((cell) => cell.id === selectedId));
  let agentContext = $derived<AgentContext>({
    notebookId: notebook?.id,
    notebookTitle: notebook?.title,
    selectedCell: selectedCell ? {
      id: selectedCell.id,
      type: selectedCell.cell_type,
      source: selectedCell.source
    } : undefined
  });

  onMount(() => {
    void initialize();
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void persist(); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  onDestroy(() => { void notebookSessions.shutdownAll(); });

  async function initialize() {
    notebooks = await ensureNotebookList();
    void refreshFiles();
    const routeId = page.params.id ?? 'workspace';
    const target = routeId === 'workspace' ? notebooks[0] ?? null : await getNotebook(routeId) ?? notebooks[0] ?? null;
    if (target) {
      panelMode = 'list';
      panelCollapsed = false;
      setNotebook(target);
      saved = true;
      if (routeId === 'workspace' || routeId !== target.id) void goto(`/notebook/${target.id}`, { replaceState: true });
    } else {
      setNotebook(null);
    }
  }

  $effect(() => {
    const model = editorModel;
    if (!model) return;
    const sync = () => syncNotebookFromEditor(true);
    model.contentChanged.connect(sync);
    return () => model.contentChanged.disconnect(sync);
  });

  function setNotebook(next: Notebook | null, selectId?: string) {
    notebook = next;
    sessionContext = next ? notebookSessions.get(next.id) : null;
    selectedId = selectId ?? next?.cells[0]?.id ?? '';
    editorModel = next ? new EditorNotebookModel(exportNotebook(next) as never) : null;
    editorController = editorModel && sessionContext ? new NotebookController(editorModel, sessionContext) : null;
  }

  async function ensureNotebookList() {
    let list = await getNotebooks();
    if (!list.length) {
      await saveNotebook(createNotebook('示例 Notebook'));
      list = await getNotebooks();
    }
    return list;
  }

  function refreshEditorFromNotebook() {
    if (notebook && sessionContext) {
      editorModel = new EditorNotebookModel(exportNotebook(notebook) as never);
      editorController = new NotebookController(editorModel, sessionContext);
    }
  }

  function syncNotebookFromEditor(markDirty = false) {
    if (!notebook || !editorModel) return;
    const current = StoredNotebookModel.fromJSON(editorModel.toJSON() as unknown as NotebookJSON);
    current.id = notebook.id;
    current.title = notebook.title;
    current.createdAt = notebook.createdAt;
    current.updatedAt = notebook.updatedAt;
    notebook = current;
    if (markDirty) changed();
  }

  function changed() {
    changeVersion += 1;
    saved = false;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void persist(), 700);
  }

  async function persist() {
    if (saveInFlight) { saveAgain = true; return; }
    saveInFlight = true;
    try {
      do {
        saveAgain = false;
        syncNotebookFromEditor(false);
        if (!notebook) return;
        const versionAtStart = changeVersion;
        const savedNotebook = await saveNotebook(notebook);
        if (changeVersion === versionAtStart) {
          notebook = savedNotebook;
          if (editorModel) editorModel.dirty = false;
          saved = true;
        } else {
          notebook.revision = savedNotebook.revision;
          saveAgain = true;
        }
      } while (saveAgain);
      notebooks = await getNotebooks();
    } catch (error) {
      saved = false;
      fileNotice = { kind: 'error', text: error instanceof Error ? error.message : '保存失败' };
    } finally {
      saveInFlight = false;
    }
  }

  async function createNewNotebook() {
    const created = await saveNotebook(createNotebook(uniqueNotebookTitle()));
    notebooks = await getNotebooks();
    setNotebook(created);
    saved = true;
    goto(`/notebook/${created.id}`);
  }

  function uniqueNotebookTitle() {
    const base = '未命名 Notebook';
    let max = 0;
    for (const item of notebooks) {
      const match = new RegExp(`^${base}(?: (\\d+))?$`).exec(item.title);
      if (match) max = Math.max(max, match[1] ? Number(match[1]) : 0);
    }
    return `${base} ${max + 1}`;
  }

  function chooseImport() {
    importInput?.click();
  }

  async function handleImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const imported = importNotebook(await file.text(), file.name);
      setNotebook(await saveNotebook(imported));
      notebooks = await getNotebooks();
      saved = true;
      fileNotice = { kind: 'success', text: `已导入 ${file.name} · ${notebook?.cells.length ?? 0} 个单元` };
      await goto(`/notebook/${notebook?.id ?? 'workspace'}`);
    } catch (error) {
      fileNotice = { kind: 'error', text: error instanceof Error ? error.message : '导入失败' };
    }
    window.setTimeout(() => fileNotice = null, 5000);
  }

  async function refreshFiles() {
    uploadedFiles = await listFiles();
  }

  function chooseFileUpload() {
    fileUploadInput?.click();
  }

  async function handleFileUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    try {
      await uploadFiles(files);
      await refreshFiles();
      fileNotice = { kind: 'success', text: `已上传 ${files.length} 个文件` };
    } catch (error) {
      fileNotice = { kind: 'error', text: error instanceof Error ? error.message : '上传失败' };
    }
    window.setTimeout(() => fileNotice = null, 5000);
  }

  function downloadNotebook(target: Notebook) {
    const content = JSON.stringify(exportNotebook(target), null, 2) + '\n';
    const url = URL.createObjectURL(new Blob([content], { type: 'application/x-ipynb+json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = notebookDownloadName(target);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    fileNotice = { kind: 'success', text: `已导出 ${anchor.download}` };
    window.setTimeout(() => fileNotice = null, 3500);
  }

  async function openNotebook(id: string) {
    const target = await getNotebook(id);
    if (!target) return;
    panelMode = 'list';
    panelCollapsed = false;
    setNotebook(target);
    saved = true;
    goto(`/notebook/${id}`);
  }

  function togglePanel(mode: 'list' | 'folders') {
    if (panelMode === mode) panelCollapsed = !panelCollapsed;
    else {
      panelMode = mode;
      panelCollapsed = false;
    }
  }

  function closeMenus(event: MouseEvent) {
    const target = event.target as Element;
    if (!target.closest('.more-wrap')) { activeNotebookMenu = null; activeCellMenu = null; }
    if (!target.closest('.run-menu-wrap')) runMenuOpen = false;
  }

  function selectOnMount(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function startRenameNotebook(item: Notebook) {
    activeNotebookMenu = null;
    renamingCellId = null;
    renamingNotebookId = item.id;
    renameValue = item.title;
  }

  function startRenameCell(cell: NotebookCell) {
    activeCellMenu = null;
    renamingNotebookId = null;
    renamingCellId = cell.id;
    renameValue = cell.label ?? '';
  }

  function renameKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') { event.preventDefault(); commitRename(); }
    else if (event.key === 'Escape') { renamingNotebookId = null; renamingCellId = null; }
  }

  async function commitRename() {
    if (renamingNotebookId) {
      const id = renamingNotebookId;
      renamingNotebookId = null;
      const renamed = await renameNotebook(id, renameValue);
      notebooks = await getNotebooks();
      if (notebook?.id === id) notebook = renamed;
    } else if (renamingCellId) {
      const id = renamingCellId;
      renamingCellId = null;
      if (!notebook) return;
      const label = renameValue.trim();
      notebook.cells = notebook.cells.map((cell) => cell.id === id ? { ...cell, label: label || undefined } : cell);
      refreshEditorFromNotebook();
      changed();
    }
  }

  async function duplicateNotebookAction(id: string) {
    const copy = await duplicateNotebook(id);
    if (!copy) return;
    notebooks = await getNotebooks();
    activeNotebookMenu = null;
    await openNotebook(copy.id);
  }

  async function removeNotebook(id: string) {
    await deleteNotebook(id);
    await notebookSessions.remove(id);
    notebooks = await getNotebooks();
    activeNotebookMenu = null;
    if (notebook?.id === id) {
      notebooks = await ensureNotebookList();
      const next = notebooks[0];
      if (next) await openNotebook(next.id);
    }
  }

  function relativeTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }

  function duplicateCell(cell: NotebookCell) {
    if (!notebook) return;
    const copy = { ...cell, id: `cell-${crypto.randomUUID()}`, status: 'idle' as const };
    const index = notebook.cells.findIndex((item) => item.id === cell.id);
    notebook.cells.splice(index + 1, 0, copy);
    notebook.cells = [...notebook.cells];
    selectedId = copy.id;
    refreshEditorFromNotebook();
    changed();
  }

  function deleteCell(id: string) {
    if (!notebook) return;
    if (notebook.cells.length === 1) {
      const replacement = createCell('code', true);
      notebook.cells = [replacement];
      selectedId = replacement.id;
      refreshEditorFromNotebook();
      changed();
      return;
    }
    const index = notebook.cells.findIndex((cell) => cell.id === id);
    notebook.cells = notebook.cells.filter((cell) => cell.id !== id);
    selectedId = notebook.cells[Math.max(0, index - 1)]?.id ?? '';
    refreshEditorFromNotebook();
    changed();
  }

  function moveCell(id: string, direction: -1 | 1) {
    if (!notebook) return;
    const from = notebook.cells.findIndex((cell) => cell.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= notebook.cells.length) return;
    const [moved] = notebook.cells.splice(from, 1);
    notebook.cells.splice(to, 0, moved);
    notebook.cells = [...notebook.cells];
    selectedId = id;
    refreshEditorFromNotebook();
    changed();
    setTimeout(() => document.getElementById(`lumen-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  function cutCell(cell: NotebookCell) {
    navigator.clipboard?.writeText(cell.source).catch(() => undefined);
    deleteCell(cell.id);
  }

  function scrollTo(id: string) {
    selectedId = id;
    editorController?.select(id);
    document.getElementById(`lumen-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function dropOn(targetId: string) {
    if (!notebook || !dragId || dragId === targetId) return;
    const from = notebook.cells.findIndex((cell) => cell.id === dragId);
    const to = notebook.cells.findIndex((cell) => cell.id === targetId);
    const [moved] = notebook.cells.splice(from, 1);
    notebook.cells.splice(to, 0, moved);
    notebook.cells = [...notebook.cells];
    dragId = null;
    refreshEditorFromNotebook();
    changed();
  }

  function icon(type: CellType) { return type === 'code' ? Braces : type === 'circuit' ? CircuitBoard : type === 'raw' ? Text : FileText; }

  let resizing = $state(false);
  function beginResize(e: PointerEvent) {
    resizing = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function endResize() { resizing = false; }
  function moveSidebarResize(e: PointerEvent) {
    if (!resizing) return;
    const rect = document.querySelector('.editor-body')?.getBoundingClientRect();
    if (!rect) return;
    sidebarWidth = Math.min(420, Math.max(180, Math.round(e.clientX - rect.left)));
  }
  function moveAiResize(e: PointerEvent) {
    if (!resizing) return;
    const rect = document.querySelector('.editor-body')?.getBoundingClientRect();
    if (!rect) return;
    const max = Math.min(460, Math.round(rect.height * 0.45));
    aiHeight = Math.min(max, Math.max(220, Math.round(rect.bottom - e.clientY)));
  }
  function moveAiWidthResize(e: PointerEvent) {
    if (!resizing) return;
    const rect = document.querySelector('.editor-body')?.getBoundingClientRect();
    if (!rect) return;
    aiWidth = Math.min(600, Math.max(280, Math.round(rect.right - e.clientX)));
  }
  function toggleAiPlacement() {
    const next = aiPlacement === 'right' ? 'bottom' : 'right';
    aiPlacement = next;
    if (next === 'bottom') {
      const rect = document.querySelector('.editor-body')?.getBoundingClientRect();
      const max = rect ? Math.min(460, Math.round(rect.height * 0.45)) : 360;
      aiHeight = Math.min(max, Math.max(220, aiHeight));
    }
  }

</script>

<svelte:head><title>{notebook?.title ?? 'Notebook'} · Lumen</title></svelte:head>
<svelte:window onclick={closeMenus} />

<div class="notebook-shell">
  <input bind:this={importInput} class="file-input" type="file" accept=".ipynb,application/x-ipynb+json,application/json" onchange={handleImport} />
  <input bind:this={fileUploadInput} class="file-input" type="file" multiple onchange={handleFileUpload} />
  {#if fileNotice}<div class:notice-error={fileNotice.kind === 'error'} class="file-notice" role="status">{fileNotice.text}</div>{/if}
  <nav class="menu-bar" aria-label="应用菜单">
    <div class="menu-brand">Lumen</div>
    <div class="menu-items">
      <button>文件</button>
      <button>编辑</button>
      <button>视图</button>
      <button>插入</button>
      <button>单元格</button>
      <button>运行</button>
      <button>帮助</button>
    </div>
  </nav>
  <header class="app-toolbar" aria-label="Notebook 应用工具栏">
    <div class="app-toolbar-main">
      <button class="new" onclick={createNewNotebook}><Plus size={14} /> New Notebook</button>
      {#if notebook}
        <button class="cell-add code" title="新增代码单元" onclick={() => editorController?.insert('code')}><Braces size={13} /> + Code</button>
        <button class="cell-add markdown" title="新增 Markdown 单元" onclick={() => editorController?.insert('markdown')}><FileText size={13} /> + Markdown</button>
        <button class="cell-add circuit" title="新增电路单元" onclick={() => editorController?.insert('circuit')}><CircuitBoard size={13} /> + Circuit</button>
        <div class="run-menu-wrap">
          <button class="run-trigger" class:open={runMenuOpen} aria-haspopup="menu" aria-expanded={runMenuOpen} onclick={() => runMenuOpen = !runMenuOpen}>运行 <ChevronDown size={13} /></button>
          {#if runMenuOpen}
            <div class="run-menu" role="menu">
              <button class="run-selected" role="menuitem" onclick={() => { runMenuOpen = false; editorController?.runSelected(); }}><Play size={13} /> 运行选中</button>
              <button class="run-all" role="menuitem" onclick={() => { runMenuOpen = false; editorController?.runAll(); }}><ListChecks size={13} /> 全部运行 Run All</button>
              <button class="run-stop" role="menuitem" onclick={() => { runMenuOpen = false; void sessionContext?.interrupt(); }}><Square size={13} /> 停止 Stop</button>
              <button class="run-restart" role="menuitem" onclick={() => { runMenuOpen = false; void sessionContext?.restart(); }}><RotateCw size={13} /> 重启内核 Restart</button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
    <div class="app-toolbar-actions">
      <button class:active={aiOpen} onclick={() => aiOpen = !aiOpen}><Sparkles size={13} /> AI Assistant</button>
      <button aria-label="返回首页" title="返回首页" onclick={() => goto('/')}><ArrowLeft size={16} /></button>
    </div>
  </header>

  <div class="editor-body panel-open" class:panel-collapsed={panelCollapsed} class:ai-open={aiOpen} class:ai-bottom={aiPlacement === 'bottom'} class:resizing={resizing} style={`--sidebar-w: ${sidebarWidth}px; --ai-w: ${aiWidth}px; --ai-h: ${aiHeight}px`}>
    <aside class="sidebar-shell">
      <nav class="sidebar-rail" aria-label="Notebook 侧边栏">
        <button class:active={panelMode === 'list' && !panelCollapsed} aria-pressed={panelMode === 'list' && !panelCollapsed} onclick={() => togglePanel('list')}><List size={15} /><span>列表</span></button>
        <button class:active={panelMode === 'folders' && !panelCollapsed} aria-pressed={panelMode === 'folders' && !panelCollapsed} onclick={() => togglePanel('folders')}><Folder size={15} /><span>文件夹</span></button>
      </nav>

      {#if !panelCollapsed}<section class="side-panel">
          <div class="panel-head"><strong>{panelMode === 'list' ? 'Notebook 列表' : 'Notebook 文件夹'}</strong><div class="panel-head-actions">{#if panelMode === 'list'}<button class="panel-upload" title="上传 .ipynb" aria-label="上传 .ipynb" onclick={chooseImport}><Upload size={15} /></button><small>{notebooks.length}</small>{/if}</div></div>

          {#if panelMode === 'list'}
            <div class="panel-content list-content">
              <div class="list-search">
                <Search size={13} />
                <input bind:value={listQuery} placeholder="搜索 Notebook…" aria-label="搜索 Notebook" />
              </div>
              <div class="notebook-list">
                {#each filteredNotebooks as item}
                  {#if renamingNotebookId === item.id}
                    <div class="notebook-row renaming">
                      <input class="rename-input" use:selectOnMount bind:value={renameValue} onkeydown={renameKeydown} onblur={commitRename} aria-label="重命名 Notebook" />
                    </div>
                  {:else}
                    <div class="notebook-row" class:active={notebook?.id === item.id}>
                      <button class="row-main" onclick={() => openNotebook(item.id)}><BookOpen size={14} /><span><b>{item.title}</b><small>{item.cells.length} 个单元 · {relativeTime(item.updatedAt)}</small></span></button>
                      <div class="more-wrap">
                        <button class="row-more" aria-label="更多操作" onclick={(e) => { e.stopPropagation(); activeNotebookMenu = activeNotebookMenu === item.id ? null : item.id; }}><MoreHorizontal size={15} /></button>
                        {#if activeNotebookMenu === item.id}
                          <div class="row-menu">
                            <button onclick={() => startRenameNotebook(item)}><Pencil size={13} /> 重命名</button>
                            <button onclick={() => duplicateNotebookAction(item.id)}><Copy size={13} /> 复制</button>
                            <button onclick={() => { activeNotebookMenu = null; downloadNotebook(item); }}><Download size={13} /> 导出</button>
                            <button class="danger" onclick={() => removeNotebook(item.id)}><Trash2 size={13} /> 删除</button>
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/if}
                {:else}
                  <div class="panel-empty"><FileText size={20} /><p>{listQuery ? '没有匹配的 Notebook' : '还没有 Notebook'}</p></div>
                {/each}
              </div>
            </div>
          {:else}
            <div class="panel-content folder-content">
              <button class="folder-upload" onclick={chooseFileUpload}>
                <span class="folder-card-icon"><Upload size={18} /></span>
                <span><b>上传文件</b><small>{uploadedFiles.length} 个已上传文件</small></span>
              </button>
              {#if uploadedFiles.length}
                <div class="uploaded-mini-list">
                  {#each uploadedFiles.slice(0, 6) as file}
                    <div class="uploaded-mini-row"><FileText size={13} /><span>{file.name}</span></div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </section>{/if}
      {#if !panelCollapsed}<div class="sidebar-resizer" role="separator" aria-orientation="vertical" title="拖动调整宽度" onpointerdown={beginResize} onpointermove={moveSidebarResize} onpointerup={endResize} onpointercancel={endResize}></div>{/if}
    </aside>

    <main class="notebook-main">
      {#if notebook}
        <div class="canvas-head">
          <div>
            <span class="path">
              <button class="canvas-outline-toggle" class:active={editorOutlineOpen} aria-expanded={editorOutlineOpen} title="Notebook 目录" onclick={() => editorOutlineOpen = !editorOutlineOpen}><ListTree size={13} /></button>
              Notebook <ChevronRight size={11} /> {notebook.title}
            </span>
            <span class="canvas-meta">{notebook.cells.length} 个单元 · 最后更新 {relativeTime(notebook.updatedAt)} · {saved ? '所有更改已保存' : '正在保存'}</span>
          </div>
          <div class="canvas-actions">
            {#if sessionContext}<KernelStatus source={sessionContext} />{/if}
          </div>
        </div>

        <div class="notebook-scroll">
          <div class="notebook-workspace" class:outline-collapsed={!editorOutlineOpen}>
            {#if editorOutlineOpen}
              <section class="editor-outline-card">
                <div class="cell-outline editor-cell-outline">
                  {#each notebook.cells as cell, index}
                    {@const Icon = icon(cell.cell_type)}
                    {#if renamingCellId === cell.id}
                      <div class="cell-row renaming">
                        <input class="rename-input" use:selectOnMount bind:value={renameValue} onkeydown={renameKeydown} onblur={commitRename} placeholder="单元名称" aria-label="重命名单元" />
                      </div>
                    {:else}
                      <div class="cell-row" class:active={selectedId === cell.id}>
                        <button class="row-main" draggable="true" ondragstart={() => dragId = cell.id} ondragover={(e) => e.preventDefault()} ondrop={() => dropOn(cell.id)} onclick={() => scrollTo(cell.id)}>
                          <GripVertical size={12} class="grip" /><span class={`type-icon ${cell.cell_type}`}><Icon size={13} /></span><span><b>{cellLabel(cell, index)}</b><small>{cell.cell_type === 'code' ? 'Python' : cell.cell_type === 'markdown' ? 'Markdown' : cell.cell_type === 'raw' ? 'Raw' : 'Circuit'}</small></span>
                        </button>
                        <div class="more-wrap">
                          <button class="row-more" aria-label="更多操作" onclick={(e) => { e.stopPropagation(); activeCellMenu = activeCellMenu === cell.id ? null : cell.id; }}><MoreHorizontal size={15} /></button>
                          {#if activeCellMenu === cell.id}
                            <div class="row-menu">
                              <button onclick={() => startRenameCell(cell)}><Pencil size={13} /> 重命名</button>
                              <button onclick={() => { activeCellMenu = null; duplicateCell(cell); }}><Copy size={13} /> 复制</button>
                              <button class="danger" onclick={() => { activeCellMenu = null; deleteCell(cell.id); }}><Trash2 size={13} /> 删除</button>
                            </div>
                          {/if}
                        </div>
                      </div>
                    {/if}
                  {/each}
                </div>
              </section>
            {/if}
            <div class="notebook-editor-region">
              {#if editorModel && editorController && sessionContext}
                {#key editorController}
                  <NotebookEditor model={editorModel} controller={editorController} session={sessionContext} showToolbar={false} showStatusBar={false} onsave={persist} onselect={(id) => selectedId = id ?? ''} bind:searchOpen />
                {/key}
              {/if}
            </div>
          </div>
        </div>
      {:else}
        <div class="notebook-loading">正在打开 Notebook...</div>
      {/if}
    </main>

    {#if aiOpen}
      <aside class="ai-panel">
        {#if aiPlacement === 'bottom'}
          <div class="ai-resizer" role="separator" aria-orientation="horizontal" title="拖动调整高度" onpointerdown={beginResize} onpointermove={moveAiResize} onpointerup={endResize} onpointercancel={endResize}></div>
        {:else}
          <div class="ai-resizer-h" role="separator" aria-orientation="vertical" title="拖动调整宽度" onpointerdown={beginResize} onpointermove={moveAiWidthResize} onpointerup={endResize} onpointercancel={endResize}></div>
        {/if}
        <AgentChat model={agentChatModel} context={agentContext} placement={aiPlacement} onclose={() => aiOpen = false} onplacement={toggleAiPlacement} />
      </aside>
    {/if}
  </div>

  <AiPet open={aiOpen} ontoggle={() => aiOpen = !aiOpen} />
</div>

<style>
  .file-input { display: none; }
  .file-notice { position: fixed; z-index: 100; top: 88px; right: 18px; max-width: min(420px, calc(100vw - 36px)); padding: 10px 14px; border: 1px solid #aac0ae; border-radius: 9px; background: #f1f8f2; color: #426047; box-shadow: var(--shadow); font-size: 11px; }
  .file-notice.notice-error { border-color: #ddb0a8; background: #fff3f0; color: #9a493e; }
  .notebook-shell { height: 100vh; overflow: hidden; background: #efeee9; color: var(--ink); }
  .menu-bar { height: 36px; flex: 0 0 36px; display: flex; align-items: center; gap: 4px; padding: 0 12px; background: #fbfbf9; border-bottom: 1px solid var(--line); overflow-x: auto; scrollbar-width: none; }
  .menu-bar::-webkit-scrollbar { display: none; }
  .menu-brand { flex: 0 0 auto; display: flex; align-items: center; padding: 0 10px 0 4px; color: var(--ink); font: 650 12px var(--font-display); letter-spacing: -.01em; }
  .menu-items { display: flex; align-items: center; gap: 2px; }
  .menu-items button { height: 28px; flex: 0 0 auto; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font: 500 11px var(--font-body); cursor: pointer; }
  .menu-items button:hover { background: var(--paper-deep); color: var(--ink); }
  .app-toolbar { position: sticky; top: 0; z-index: 40; height: 40px; display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 0 16px; border-bottom: 1px solid var(--line); background: #fff; }
  .app-toolbar-main, .app-toolbar-actions { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .app-toolbar-main { flex: 1 1 auto; }
  .app-toolbar button { height: 24px; flex: 0 0 auto; display: flex; align-items: center; gap: 5px; padding: 0 8px; border: 1px solid var(--line); border-radius: 8px; background: white; color: var(--ink); font: 650 9px var(--font-body); cursor: pointer; }
  .app-toolbar button:hover { border-color: #b7b8b0; background: var(--paper); }
  .app-toolbar button.active { border-color: var(--sage-dark); background: var(--sage-soft); color: var(--sage-dark); }
  .app-toolbar .new { border-color: var(--ink); background: var(--ink); color: white; }
  .app-toolbar .cell-add.code { color: #557461; }
  .app-toolbar .cell-add.markdown { color: #a65f49; }
  .app-toolbar .cell-add.circuit { color: #5a7088; }
  .run-menu-wrap { position: relative; flex: 0 0 auto; }
  .run-trigger.open { border-color: var(--sage-dark); background: var(--sage-soft); color: var(--sage-dark); }
  .run-menu { position: absolute; left: 0; top: calc(100% + 6px); z-index: 60; min-width: 186px; padding: 5px; border: 1px solid var(--line); border-radius: 9px; background: white; box-shadow: var(--shadow); }
  .run-menu button { width: 100%; height: 30px; display: flex; align-items: center; gap: 8px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--ink); font: 500 11px var(--font-body); text-align: left; cursor: pointer; }
  .run-menu button:hover { background: var(--sage-soft); color: var(--sage-dark); }
  .run-menu button.run-selected :global(svg) { color: #4f7a52; }
  .run-menu button.run-all :global(svg) { color: #3f7a9e; }
  .run-menu button.run-stop :global(svg) { color: #c0533f; }
  .run-menu button.run-restart :global(svg) { color: #d08a3a; }
  .editor-body { height: calc(100vh - 76px); display: grid; grid-template-columns: var(--sidebar-w, 248px) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); grid-template-areas: "sidebar notebook"; transition: grid-template-columns .22s ease, grid-template-rows .22s ease; }.editor-body.panel-collapsed { grid-template-columns: 48px minmax(0, 1fr); }.editor-body.resizing { transition: none !important; }
  aside { position: relative; z-index: 10; min-width: 0; overflow: visible; }
  .list-search { display: flex; align-items: center; gap: 6px; height: 30px; margin: 0 2px 8px; padding: 0 9px; border: 1px solid var(--line); border-radius: 8px; background: white; color: var(--muted); }.list-search:focus-within { border-color: var(--sage); box-shadow: 0 0 0 3px #718d7920; }.list-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; font: 11px var(--font-body); color: var(--ink); }.notebook-list { display: grid; gap: 2px; }.notebook-row { position: relative; display: flex; align-items: center; }.notebook-row .row-main { flex: 1; min-width: 0; min-height: 34px; display: grid; grid-template-columns: 20px 1fr; align-items: center; gap: 2px; padding: 4px 6px; border: 0; border-radius: 7px; background: transparent; color: var(--ink); text-align: left; cursor: pointer; }.notebook-row .row-main:hover { background: #eeeee8; }.notebook-row.active .row-main { background: #e6ece6; color: var(--sage-dark); }.notebook-list b,.notebook-list small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.notebook-list b { margin-bottom: 2px; font-size: 10px; }.notebook-list small { color: var(--muted); font-size: 8px; }
  .cell-outline { position: relative; display: grid; gap: 2px; }.cell-row { position: relative; display: flex; align-items: center; }.cell-row .row-main { position: relative; z-index: 1; flex: 1; min-width: 0; min-height: 38px; display: grid; grid-template-columns: 12px 24px 1fr; align-items: center; gap: 5px; padding: 4px 6px 4px 4px; text-align: left; border: 0; border-radius: 8px; background: transparent; cursor: pointer; }.cell-row .row-main:hover { background: #eeeee8; }.cell-row.active .row-main { background: white; box-shadow: 0 1px 3px #20291f10; }.cell-outline .grip { color: #b2b3ac; }.cell-outline .row-main > span:last-child { min-width: 0; }.cell-outline .row-main b,.cell-outline .row-main small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.cell-outline .row-main b { margin-bottom: 2px; color: var(--ink); font-size: 10px; }.cell-outline .row-main small { color: var(--muted); font-size: 8px; text-transform: uppercase; letter-spacing: .05em; }
  .notebook-workspace { min-height: 100%; display: grid; grid-template-columns: 228px minmax(0, 1fr); align-items: stretch; gap: 0; transition: grid-template-columns .18s ease; }.notebook-workspace.outline-collapsed { grid-template-columns: minmax(0, 1fr); }
  .notebook-editor-region { min-width: 0; }
  .editor-outline-card { position: sticky; top: 0; z-index: 6; align-self: start; min-height: calc(100vh - 126px); max-height: calc(100vh - 116px); overflow: visible; border-right: 1px solid var(--line); background: #f4f3ee; }.editor-cell-outline { max-height: calc(100vh - 126px); overflow-y: auto; gap: 1px; padding: 6px; }.editor-cell-outline .cell-row { min-width: 0; }.editor-cell-outline .cell-row .row-main { min-height: 34px; background: transparent; border-radius: 7px; }.editor-cell-outline .cell-row .row-main:hover { background: #ecebe5; }.editor-cell-outline .cell-row.active .row-main { background: #e6ece6; box-shadow: none; }
  .type-icon { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 6px; }.type-icon.code { background: #e8efe8; color: #557461; }.type-icon.markdown { background: #f7eae4; color: #a65f49; }.type-icon.raw { background: #f0ece6; color: #7e6d5a; }.type-icon.circuit { background: #e9edf2; color: #5a7088; }
  .more-wrap { position: relative; flex: 0 0 auto; }.row-more { width: 24px; height: 24px; flex: 0 0 24px; display: grid; place-items: center; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; }.row-more:hover { background: var(--paper-deep); color: var(--ink); }.row-menu { position: absolute; right: 0; top: 100%; z-index: 30; min-width: 116px; padding: 4px; border: 1px solid var(--line); background: white; border-radius: 9px; box-shadow: var(--shadow); }.side-panel .row-menu { left: calc(100% + 8px); right: auto; top: -4px; }.row-menu button { width: 100%; display: flex; align-items: center; gap: 7px; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--ink); font: 500 10px var(--font-body); text-align: left; cursor: pointer; }.row-menu button:hover { background: var(--paper-deep); }.row-menu button.danger { color: #a54f42; }.row-menu button.danger:hover { background: #fff1ee; }.rename-input { width: 100%; min-width: 0; height: 30px; padding: 4px 8px; border: 1px solid var(--sage); border-radius: 7px; background: white; color: var(--ink); font: 500 11px var(--font-body); outline: none; box-shadow: 0 0 0 2px #718d7920; }.notebook-row.renaming,.cell-row.renaming { padding: 2px 0; }
  .notebook-main { grid-area: notebook; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; padding: 0; }.editor-body.ai-bottom .notebook-main { border-bottom: 1px solid #b8bab2; box-shadow: inset 0 -10px 18px -18px #18211b; }.notebook-scroll { flex: 1; min-height: 0; overflow-y: auto; scroll-behavior: smooth; padding: 10px 8px 56px; }.editor-body.ai-bottom .notebook-scroll { padding-bottom: 28px; }.canvas-head { flex: 0 0 auto; min-height: 38px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 7px 14px; border-bottom: 1px solid var(--line); background: #f8f7f3; }.canvas-head > div:first-child { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; }.path { display: flex; align-items: center; gap: 4px; color: var(--muted); font-size: 8px; }.canvas-head .path { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--ink); font-size: 10px; font-weight: 600; }.canvas-outline-toggle { width: 23px; height: 23px; flex: 0 0 23px; display: grid; place-items: center; margin-right: 3px; border: 1px solid var(--line); border-radius: 6px; background: white; color: var(--muted); cursor: pointer; }.canvas-outline-toggle:hover { background: var(--paper); color: var(--ink); }.canvas-outline-toggle.active { border-color: var(--sage-dark); background: var(--sage-soft); color: var(--sage-dark); }.canvas-meta { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--muted); font-size: 9px; white-space: nowrap; }.canvas-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; }
  .notebook-loading { flex: 1; display: grid; place-items: center; color: var(--muted); font-size: 11px; }
  .editor-body.ai-open:not(.ai-bottom) { grid-template-columns: var(--sidebar-w, 248px) minmax(0, 1fr) var(--ai-w, 340px); grid-template-areas: "sidebar notebook ai"; }.editor-body.ai-open.panel-collapsed:not(.ai-bottom) { grid-template-columns: 48px minmax(0, 1fr) var(--ai-w, 340px); }.editor-body.ai-open.ai-bottom { grid-template-columns: var(--sidebar-w, 248px) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) clamp(220px, var(--ai-h, 320px), 460px); grid-template-areas: "sidebar notebook" "sidebar ai"; }.editor-body.ai-open.ai-bottom.panel-collapsed { grid-template-columns: 48px minmax(0, 1fr); }
  aside.sidebar-shell { grid-area: sidebar; display: flex; flex-direction: row; width: 100%; overflow: visible; border-right: 1px solid #2c3034; background: #191b1f; opacity: 1; }
  .sidebar-rail { width: 48px; flex: 0 0 48px; display: flex; flex-direction: column; align-items: stretch; padding-top: 10px; background: #191b1f; color: #e9edf0; }
  .sidebar-rail button { position: relative; min-height: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: 0; background: transparent; color: #cfd4d8; font: 650 9px var(--font-body); cursor: pointer; transition: background .15s, color .15s; }
  .sidebar-rail button:hover { background: #23262b; color: white; }.sidebar-rail button.active { background: #272a2f; color: white; }.sidebar-rail button.active::before { content: ''; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 0 3px 3px 0; background: var(--terracotta); }
  .side-panel { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; overflow: visible; background: #f8f7f2; color: var(--ink); border-left: 1px solid #2c3034; }
  .panel-head { height: 48px; flex: 0 0 48px; display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 0 10px 0 14px; border-bottom: 1px solid var(--line); }.panel-head > strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 650 14px var(--font-display); }.panel-head-actions { display: flex; align-items: center; gap: 7px; }.panel-head-actions small { min-width: 23px; height: 21px; display: grid; place-items: center; border-radius: 11px; background: var(--paper-deep); color: var(--muted); font-size: 9px; font-weight: 700; }.panel-upload { width: 23px; height: 21px; display: grid; place-items: center; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; }.panel-upload:hover { background: var(--paper-deep); color: var(--sage-dark); }
  .panel-content { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 7px 14px; }.panel-content.list-content { overflow: visible; }.panel-section-title { display: flex; justify-content: space-between; align-items: center; padding: 2px 7px 8px; color: #92968e; font-size: 8px; font-weight: 750; text-transform: uppercase; letter-spacing: .1em; }
  .panel-empty { min-height: 120px; display: grid; place-items: center; align-content: center; gap: 8px; color: #a0a39d; text-align: center; }.panel-empty.large { min-height: 240px; }.panel-empty p { margin: 0; font-size: 9px; line-height: 1.6; }
  .folder-upload { width: 100%; min-height: 58px; display: grid; grid-template-columns: 38px 1fr; align-items: center; gap: 8px; padding: 8px; border: 1px solid var(--line); border-radius: 9px; background: white; color: var(--muted); text-align: left; cursor: pointer; }.folder-upload:hover { border-color: #b7b8b0; background: #fafaf7; }.folder-card-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 8px; background: var(--sage-soft); color: var(--sage-dark); }.folder-upload b,.folder-upload small { display: block; }.folder-upload b { margin-bottom: 4px; color: var(--ink); font-size: 10px; }.folder-upload small { color: var(--muted); font-size: 8px; }.uploaded-mini-list { display: grid; gap: 2px; margin-top: 10px; }.uploaded-mini-row { min-height: 28px; display: grid; grid-template-columns: 18px 1fr; align-items: center; gap: 5px; padding: 5px 7px; border-radius: 7px; color: var(--muted); font-size: 9px; }.uploaded-mini-row span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.uploaded-mini-row:hover { background: white; color: var(--ink); }
  .ai-panel { grid-area: ai; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; border-left: 1px solid #2c3034; background: #f8f7f2; color: var(--ink); }.editor-body.ai-bottom .ai-panel { border-left: 0; border-top: 1px solid #2c3034; }
  .ai-resizer { flex: 0 0 8px; cursor: ns-resize; touch-action: none; background: transparent; }.ai-resizer:hover { background: #d7ddd7; }
  .sidebar-resizer { position: absolute; right: -3px; top: 0; bottom: 0; width: 6px; cursor: col-resize; touch-action: none; z-index: 5; }.sidebar-resizer:hover { background: #718d79; }
  .ai-resizer-h { position: absolute; left: -3px; top: 0; bottom: 0; width: 6px; cursor: col-resize; touch-action: none; z-index: 5; }.ai-resizer-h:hover { background: #718d79; }
  @media (max-width: 680px) { .editor-body,.editor-body.panel-open,.editor-body.ai-open { grid-template-columns: 48px 1fr; grid-template-rows: 1fr; }.editor-body.ai-open.ai-bottom { grid-template-columns: 48px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) clamp(220px, var(--ai-h, 320px), 42vh); grid-template-areas: "sidebar notebook" "sidebar ai"; }.side-panel { position: fixed; z-index: 30; left: 48px; top: 76px; bottom: 0; width: 220px; box-shadow: 12px 0 28px #151a1740; }.ai-panel { position: fixed; z-index: 35; right: 0; top: 76px; bottom: 0; width: min(340px, 88vw); box-shadow: -12px 0 28px #151a1740; }.editor-body.ai-open.ai-bottom .ai-panel { position: relative; right: auto; top: auto; bottom: auto; width: auto; box-shadow: none; }.ai-resizer,.ai-resizer-h,.sidebar-resizer { display: none; }.editor-body.ai-open.ai-bottom .ai-resizer { display: block; }.notebook-scroll { padding-top: 34px; } }
</style>
