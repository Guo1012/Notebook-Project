<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { ArrowRight, BookOpen, ChevronDown, Clock3, FileText, MoreHorizontal, Search, Sparkles, Trash2 } from '@lucide/svelte';
  import Brand from '$lib/components/Brand.svelte';
  import { deleteNotebook, getNotebooks } from '$lib/notebooks';
  import type { Notebook } from '$lib/types';

  let notebooks = $state<Notebook[]>([]);
  let query = $state('');
  let menuOpen = $state(false);
  let activeMenu = $state<string | null>(null);

  onMount(() => { void loadNotebooks(); });

  async function loadNotebooks() {
    notebooks = await getNotebooks();
  }

  let filtered = $derived(notebooks.filter((n) => n.title.toLowerCase().includes(query.toLowerCase())));

  function enterNotebook() { goto('/notebook/workspace'); }

  async function remove(id: string) {
    await deleteNotebook(id);
    notebooks = await getNotebooks();
    activeMenu = null;
  }

  function relativeTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }

  function closeMenus(event: MouseEvent) {
    const target = event.target as Element;
    if (!target.closest('.new-wrap')) menuOpen = false;
    if (!target.closest('.more-wrap')) activeMenu = null;
  }
</script>

<svelte:head><title>我的 Notebooks · Lumen</title></svelte:head>
<svelte:window onclick={closeMenus} />

<div class="home-shell">
  <header class="topbar">
    <Brand />
    <div class="search-wrap">
      <Search size={17} />
      <input bind:value={query} aria-label="搜索 Notebook" placeholder="搜索 notebooks…" />
      <kbd>⌘ K</kbd>
    </div>
    <div class="avatar" title="个人空间">L</div>
  </header>

  <main>
    <section class="hero">
      <div>
        <span class="eyebrow"><Sparkles size={14} /> 你的实验工作台</span>
        <h1>把想法，变成<br /><em>可运行的知识。</em></h1>
        <p>在同一个空间里编写代码、记录思考，并构建下一次电路实验。</p>
      </div>
      <div class="new-wrap">
        <button class="new-button" onclick={enterNotebook}>进入 Notebook <ArrowRight size={18} /></button>
        <button class="new-toggle" aria-label="打开新建菜单" onclick={() => menuOpen = !menuOpen}><ChevronDown size={17} /></button>
        {#if menuOpen}
          <div class="new-menu">
            <button onclick={enterNotebook}><span class="menu-icon"><BookOpen size={17} /></span><span><strong>进入 Notebook</strong><small>打开工作区后创建或选择 Notebook</small></span></button>
          </div>
        {/if}
      </div>
    </section>

    <section class="library">
      <div class="section-head">
        <div><span>工作空间</span><h2>最近的 Notebooks</h2></div>
        <span class="count">{notebooks.length} 个项目</span>
      </div>

      {#if filtered.length}
        <div class="notebook-grid">
          {#each filtered as notebook, index}
            <div class="notebook-card" role="button" tabindex="0" style={`--delay:${index * 50}ms`} onclick={() => goto(`/notebook/${notebook.id}`)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && goto(`/notebook/${notebook.id}`)}>
              <div class="paper-preview">
                <div class="paper-dot"></div><div class="paper-line wide"></div><div class="paper-line"></div>
                <div class="code-block"><span></span><span></span><span></span></div>
                <div class="paper-line short"></div>
                <span class="cell-count">{notebook.cells.length} cells</span>
              </div>
              <div class="card-info">
                <div><h3>{notebook.title}</h3><p><Clock3 size={13} /> 编辑于 {relativeTime(notebook.updatedAt)}</p></div>
                <div class="more-wrap">
                  <button class="icon-button" aria-label="更多操作" onclick={(e) => { e.stopPropagation(); activeMenu = activeMenu === notebook.id ? null : notebook.id; }}><MoreHorizontal size={19} /></button>
                  {#if activeMenu === notebook.id}
                    <div class="card-menu"><button onclick={(e) => { e.stopPropagation(); remove(notebook.id); }}><Trash2 size={15} /> 删除</button></div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-state">
          <span class="empty-icon"><FileText size={24} /></span>
          <h3>{query ? '没有找到相关 Notebook' : '从第一本 Notebook 开始'}</h3>
          <p>{query ? '试试其他关键词。' : '创建一个空间，让代码、笔记与实验彼此连接。'}</p>
          {#if !query}<button onclick={enterNotebook}>进入 Notebook <ArrowRight size={17} /></button>{/if}
        </div>
      {/if}
    </section>
  </main>
  <footer><span>Lumen Notebook</span><span>本地工作空间 · 自动保存</span></footer>
</div>

<style>
  .home-shell { min-height: 100vh; background: var(--paper); color: var(--ink); }
  .topbar { height: 72px; display: grid; grid-template-columns: 1fr minmax(260px, 440px) 1fr; align-items: center; padding: 0 5vw; border-bottom: 1px solid var(--line); }
  .search-wrap { height: 38px; display: flex; align-items: center; gap: 10px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; color: var(--muted); }
  .search-wrap:focus-within { border-color: var(--sage); box-shadow: 0 0 0 3px #718d7920; }
  .search-wrap input { width: 100%; border: 0; outline: 0; background: transparent; font: inherit; color: var(--ink); }
  kbd { font-size: 11px; padding: 2px 6px; border: 1px solid var(--line); border-radius: 5px; background: var(--paper); white-space: nowrap; }
  .avatar { justify-self: end; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--terracotta); color: white; font-weight: 650; font-size: 13px; }
  main { max-width: 1240px; margin: auto; padding: 72px 5vw 80px; }
  .hero { display: flex; align-items: end; justify-content: space-between; gap: 40px; padding-bottom: 68px; }
  .eyebrow { display: inline-flex; align-items: center; gap: 7px; color: var(--sage-dark); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; margin-bottom: 18px; }
  h1 { max-width: 760px; font-family: var(--font-display); font-size: clamp(48px, 6vw, 78px); line-height: .98; letter-spacing: -.055em; margin: 0; font-weight: 650; }
  h1 em { font-style: italic; font-weight: 500; color: var(--terracotta); }
  .hero p { max-width: 560px; color: var(--muted); font-size: 16px; line-height: 1.7; margin: 24px 0 0; }
  .new-wrap { position: relative; display: flex; flex: 0 0 auto; }
  .new-button, .new-toggle { border: 0; background: var(--ink); color: white; height: 46px; cursor: pointer; }
  .new-button { display: flex; align-items: center; gap: 9px; padding: 0 18px; border-radius: 11px 0 0 11px; font: 650 14px var(--font-body); }
  .new-toggle { width: 40px; border-left: 1px solid #ffffff26; border-radius: 0 11px 11px 0; }
  .new-button:hover, .new-toggle:hover { background: #29352d; }
  .new-menu { position: absolute; right: 0; top: 54px; z-index: 10; width: 260px; padding: 7px; background: white; border: 1px solid var(--line); border-radius: 13px; box-shadow: var(--shadow); }
  .new-menu button { width: 100%; display: flex; align-items: center; gap: 12px; text-align: left; border: 0; border-radius: 9px; padding: 10px; background: transparent; cursor: pointer; }
  .new-menu button:hover { background: var(--paper-deep); }
  .menu-icon { width: 34px; height: 34px; display: grid; place-items: center; background: var(--sage-soft); color: var(--sage-dark); border-radius: 8px; }
  .new-menu strong, .new-menu small { display: block; }
  .new-menu strong { font-size: 13px; color: var(--ink); }
  .new-menu small { margin-top: 3px; color: var(--muted); font-size: 11px; }
  .library { border-top: 1px solid var(--line); padding-top: 28px; }
  .section-head { display: flex; justify-content: space-between; align-items: end; margin-bottom: 24px; }
  .section-head > div > span { color: var(--muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .11em; }
  h2 { font-family: var(--font-display); font-size: 27px; letter-spacing: -.035em; margin: 5px 0 0; }
  .count { color: var(--muted); font-size: 12px; }
  .notebook-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
  .notebook-card { position: relative; overflow: visible; padding: 10px; border: 1px solid var(--line); border-radius: 15px; background: #fff; cursor: pointer; transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; animation: rise .5s both; animation-delay: var(--delay); }
  .notebook-card:hover { transform: translateY(-3px); border-color: #b9b8af; box-shadow: 0 16px 35px #2b302615; }
  .paper-preview { position: relative; height: 165px; overflow: hidden; padding: 25px 24px; border-radius: 10px; background: #f4f3ed; border: 1px solid #ebe9df; }
  .paper-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--terracotta); margin-bottom: 14px; }
  .paper-line { height: 5px; width: 48%; border-radius: 9px; background: #c9cbc1; margin: 8px 0; }
  .paper-line.wide { width: 72%; height: 7px; background: #8c9488; }
  .paper-line.short { width: 32%; }
  .code-block { width: 86%; height: 54px; margin: 16px 0 10px; padding: 12px; border-radius: 7px; background: #26312a; }
  .code-block span { display: block; height: 3px; width: 64%; margin-bottom: 7px; border-radius: 5px; background: #95b99f; }
  .code-block span:nth-child(2) { width: 82%; background: #d7b69c; }.code-block span:nth-child(3) { width: 46%; background: #b4afa2; }
  .cell-count { position: absolute; right: 14px; bottom: 12px; color: #8a8e84; font: 10px ui-monospace, monospace; }
  .card-info { min-height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 7px 5px 1px 8px; }
  .card-info h3 { margin: 0 0 7px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
  .card-info p { display: flex; align-items: center; gap: 5px; margin: 0; color: var(--muted); font-size: 11px; }
  .icon-button { width: 32px; height: 32px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer; }
  .icon-button:hover { background: var(--paper-deep); color: var(--ink); }
  .more-wrap { position: relative; }
  .card-menu { position: absolute; right: 0; top: 35px; z-index: 4; width: 110px; padding: 5px; border: 1px solid var(--line); background: white; border-radius: 9px; box-shadow: var(--shadow); }
  .card-menu button { width: 100%; display: flex; gap: 7px; align-items: center; padding: 7px 8px; border: 0; background: transparent; color: #a54f42; border-radius: 6px; cursor: pointer; }
  .card-menu button:hover { background: #fff1ee; }
  .empty-state { min-height: 280px; display: grid; place-items: center; align-content: center; text-align: center; border: 1px dashed #cac9c0; border-radius: 15px; background: #faf9f5; }
  .empty-icon { width: 50px; height: 50px; display: grid; place-items: center; border-radius: 14px; background: var(--sage-soft); color: var(--sage-dark); }
  .empty-state h3 { font-family: var(--font-display); font-size: 22px; margin: 16px 0 5px; }.empty-state p { color: var(--muted); font-size: 13px; margin: 0 0 17px; }
  .empty-state button { display: flex; align-items: center; gap: 7px; border: 0; border-radius: 9px; padding: 10px 14px; background: var(--ink); color: white; cursor: pointer; }
  footer { display: flex; justify-content: space-between; margin: 0 5vw; padding: 24px 0 32px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; }
  footer span:first-child { font-weight: 700; color: var(--ink); }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } }
  @media (max-width: 850px) { .topbar { grid-template-columns: 1fr auto; }.search-wrap { display: none; }.hero { align-items: start; flex-direction: column; }.notebook-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 560px) { main { padding-top: 46px; }.hero { padding-bottom: 46px; } h1 { font-size: 45px; }.notebook-grid { grid-template-columns: 1fr; }.new-wrap { width: 100%; }.new-button { flex: 1; justify-content: center; } }
</style>
