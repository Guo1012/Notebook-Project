<script lang="ts">
  import { untrack } from 'svelte';
  import { ChevronDown, History, MessageSquare, PanelBottom, PanelRight, Pencil, Plus, Send, Sparkles, Trash2, X } from '@lucide/svelte';
  import type { AiConversation } from './aiChat';
  import { AgentChatModel, type AgentContext } from './agentChatModel';

  let { model = new AgentChatModel(), context, placement, onclose, onplacement }: { model?: AgentChatModel; context?: AgentContext; placement: 'right' | 'bottom'; onclose: () => void; onplacement: () => void } = $props();

  // Like Jupyter document widgets, a chat widget binds to one model for its lifetime.
  let conversations = $state<AiConversation[]>(untrack(() => model.list()));
  let activeId = $state<string | null>(untrack(() => conversations[0]?.id ?? null));
  let input = $state('');
  let busy = $state(false);
  let historyOpen = $state(false);
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let scroller = $state<HTMLDivElement>();

  let active = $derived(conversations.find((c) => c.id === activeId) ?? conversations[0] ?? null);

  function newChat() {
    const convo = model.create();
    conversations = [convo, ...conversations];
    activeId = convo.id;
    historyOpen = false;
  }

  function selectChat(id: string) {
    activeId = id;
    historyOpen = false;
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const convo = active;
    if (!convo) return;
    const withUser = model.appendUserMessage(convo, text);
    conversations = model.list();
    activeId = withUser.id;
    input = '';
    busy = true;
    try {
      const done = await model.appendAssistantReply(withUser, text, context);
      conversations = model.list();
      activeId = done.id;
    } finally {
      busy = false;
    }
  }

  function startRename(id: string) {
    renamingId = id;
    renameValue = conversations.find((c) => c.id === id)?.title ?? '';
  }

  function commitRename() {
    if (!renamingId) return;
    const id = renamingId;
    renamingId = null;
    conversations = model.rename(id, renameValue);
  }

  function renameKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') { event.preventDefault(); commitRename(); }
    else if (event.key === 'Escape') { renamingId = null; }
  }

  function removeChat(id: string) {
    conversations = model.remove(id);
    if (activeId === id) activeId = conversations[0]?.id ?? null;
  }

  function resize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }

  $effect(() => {
    active;
    scroller?.scrollTo({ top: scroller.scrollHeight });
  });
</script>

<div class="ai-chat" role="region" aria-label="Agent Chat">
  <div class="ai-panel-head">
    <strong><Sparkles size={15} /> AI 助手</strong>
    <button class="head-btn primary" onclick={newChat}><Plus size={13} /> 新建对话</button>
    <button class="head-btn" class:open={historyOpen} onclick={() => { historyOpen = !historyOpen; }}><History size={13} /> 历史对话 <ChevronDown size={12} /></button>
    <span class="head-spacer"></span>
    <button class="icon-btn" title={placement === 'right' ? '移动到底部' : '移动到右侧'} onclick={onplacement}>{#if placement === 'right'}<PanelBottom size={15} />{:else}<PanelRight size={15} />{/if}</button>
    <button class="icon-btn" title="关闭 AI 助手" onclick={onclose}><X size={16} /></button>

    {#if historyOpen}
      <div class="history-menu">
        {#each conversations as convo (convo.id)}
          <div class="history-item" class:active={activeId === convo.id}>
            {#if renamingId === convo.id}
              <input class="rename-input" bind:value={renameValue} onkeydown={renameKeydown} onblur={commitRename} aria-label="重命名对话" />
            {:else}
              <button class="item-main" onclick={() => selectChat(convo.id)}><span>{convo.title}</span><small>{convo.messages.length} 条</small></button>
              <button class="item-act" title="重命名" onclick={() => startRename(convo.id)}><Pencil size={12} /></button>
              <button class="item-act danger" title="删除" onclick={() => removeChat(convo.id)}><Trash2 size={12} /></button>
            {/if}
          </div>
        {:else}
          <div class="history-empty">暂无历史对话</div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="ai-tabs" role="tablist" aria-label="对话标签页">
    {#each conversations as convo (convo.id)}
      <div class="tab" class:active={activeId === convo.id} role="presentation">
        <button class="tab-main" role="tab" aria-selected={activeId === convo.id} title={convo.title} onclick={() => selectChat(convo.id)}>{convo.title}</button>
        <button class="tab-close" aria-label="删除对话" title="删除对话" onclick={() => removeChat(convo.id)}><X size={11} /></button>
      </div>
    {/each}
  </div>

  {#if active}
    <div class="messages" bind:this={scroller}>
      {#each active.messages as msg}
        {#if msg.role === 'assistant'}
          <div class="row assistant">
            <span class="avatar"><Sparkles size={12} /></span>
            <div class="bubble">{msg.content}</div>
          </div>
        {:else}
          <div class="row user"><div class="bubble">{msg.content}</div></div>
        {/if}
      {/each}
      {#if busy}
        <div class="row assistant">
          <span class="avatar"><Sparkles size={12} /></span>
          <div class="bubble typing"><i></i><i></i><i></i></div>
        </div>
      {/if}
    </div>

    <div class="input-bar">
      <textarea
        rows="1"
        aria-label="向 AI 提问"
        placeholder="向 AI 提问…"
        bind:value={input}
        oninput={(e) => resize(e.currentTarget)}
        onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
      ></textarea>
      <button class="send" disabled={!input.trim() || busy} aria-label="发送" onclick={send}><Send size={15} /></button>
    </div>
  {:else}
    <div class="chat-empty">
      <span class="empty-icon"><MessageSquare size={22} /></span>
      <p>还没有对话，点击上方「新建对话」开始</p>
    </div>
  {/if}
</div>

<style>
  .ai-chat { flex: 1; min-height: 0; display: flex; flex-direction: column; background: #f8f7f2; }
  .ai-panel-head { position: relative; flex: 0 0 auto; display: flex; align-items: center; gap: 5px; padding: 7px 8px; border-bottom: 1px solid var(--line); background: #fff; }
  .ai-panel-head strong { display: flex; align-items: center; gap: 6px; padding-right: 2px; font: 650 12px var(--font-display); white-space: nowrap; }
  .head-btn { height: 24px; display: flex; align-items: center; gap: 3px; padding: 0 7px; border: 1px solid var(--line); border-radius: 7px; background: white; color: var(--ink); font: 600 9px var(--font-body); cursor: pointer; white-space: nowrap; }.head-btn:hover { border-color: #b7b8b0; background: var(--paper); }.head-btn.primary { border-color: var(--ink); background: var(--ink); color: white; }.head-btn.primary:hover { background: #29352d; }.head-btn.open { border-color: var(--sage-dark); color: var(--sage-dark); }
  .head-spacer { flex: 1; min-width: 2px; }
  .icon-btn { width: 26px; height: 26px; flex: 0 0 26px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 7px; background: white; color: var(--muted); cursor: pointer; }.icon-btn:hover { color: var(--ink); background: var(--paper); }
  .history-menu { position: absolute; top: calc(100% + 5px); left: 8px; z-index: 60; width: min(300px, calc(100vw - 32px)); height: 220px; overflow-y: auto; padding: 4px; border: 1px solid var(--line); border-radius: 10px; background: white; box-shadow: var(--shadow); }
  .history-item { display: flex; align-items: center; gap: 2px; padding: 2px; border-radius: 6px; }.history-item:hover { background: var(--paper-deep); }.history-item.active { background: #e6ece6; }.history-item .item-main { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; border: 0; background: transparent; color: var(--ink); font: 500 11px var(--font-body); text-align: left; cursor: pointer; }.history-item .item-main span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.history-item .item-main small { color: var(--muted); font-size: 8px; }.history-empty { padding: 18px 10px; color: var(--muted); font-size: 10px; text-align: center; }
  .item-act { width: 22px; height: 22px; flex: 0 0 22px; display: grid; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--muted); cursor: pointer; }.item-act:hover { background: #e5e5de; color: var(--ink); }.item-act.danger:hover { color: #a54f42; background: #fff1ee; }
  .rename-input { width: 100%; min-width: 0; height: 26px; padding: 4px 8px; border: 1px solid var(--sage); border-radius: 7px; background: white; color: var(--ink); font: 500 11px var(--font-body); outline: none; box-shadow: 0 0 0 2px #718d7920; }
  .ai-tabs { flex: 0 0 auto; display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--line); background: #fff; overflow-x: auto; scrollbar-width: none; }.ai-tabs::-webkit-scrollbar { display: none; }.ai-tabs:empty { display: none; }
  .tab { flex: 0 0 auto; display: flex; align-items: center; gap: 2px; max-width: 160px; padding: 3px 4px 3px 10px; border: 1px solid var(--line); border-radius: 999px; background: white; }.tab:hover { background: var(--paper-deep); }.tab.active { border-color: var(--sage-dark); background: var(--sage-soft); }
  .tab-main { flex: 1; min-width: 0; height: 22px; border: 0; background: transparent; color: var(--muted); font: 500 11px var(--font-body); text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.tab.active .tab-main { color: var(--sage-dark); font-weight: 650; }
  .tab-close { width: 18px; height: 18px; flex: 0 0 18px; display: grid; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer; }.tab-close:hover { background: #e5e5de; color: #a54f42; }
  .messages { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 10px 14px; display: flex; flex-direction: column; gap: 10px; }
  .row { display: flex; gap: 6px; max-width: 92%; }.row.assistant { align-self: flex-start; }.row.user { align-self: flex-end; }.avatar { flex: 0 0 auto; width: 22px; height: 22px; display: grid; place-items: center; border-radius: 7px; background: var(--sage-soft); color: var(--sage-dark); }.bubble { padding: 8px 10px; border-radius: 12px; font-size: 11px; line-height: 1.55; }.row.assistant .bubble { background: #fff; border: 1px solid var(--line); border-bottom-left-radius: 4px; color: var(--ink); }.row.user .bubble { background: var(--ink); color: #fff; border-bottom-right-radius: 4px; }.typing { display: flex; align-items: center; gap: 3px; }.typing i { width: 5px; height: 5px; border-radius: 50%; background: #b9c2bb; animation: blink 1.2s infinite; }.typing i:nth-child(2) { animation-delay: .2s; }.typing i:nth-child(3) { animation-delay: .4s; }
  @keyframes blink { 0%, 80%, 100% { opacity: .3; } 40% { opacity: 1; } }
  .input-bar { flex: 0 0 auto; display: flex; gap: 6px; align-items: flex-end; padding: 8px 10px; border-top: 1px solid var(--line); background: #fff; }.input-bar textarea { flex: 1; min-height: 32px; max-height: 96px; resize: none; border: 1px solid var(--line); border-radius: 10px; padding: 7px 10px; outline: 0; font: 11px/1.5 var(--font-body); color: var(--ink); background: #fff; }.input-bar textarea:focus { border-color: var(--sage); box-shadow: 0 0 0 3px #718d7920; }.send { flex: 0 0 auto; width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 9px; background: var(--ink); color: #fff; cursor: pointer; }.send:hover:not(:disabled) { background: #29352d; }.send:disabled { opacity: .4; cursor: not-allowed; }
  .chat-empty { flex: 1; min-height: 0; display: grid; place-items: center; align-content: center; gap: 10px; color: var(--muted); text-align: center; padding: 20px; }.empty-icon { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 12px; background: var(--sage-soft); color: var(--sage-dark); }.chat-empty p { margin: 0; font-size: 10px; }
</style>
