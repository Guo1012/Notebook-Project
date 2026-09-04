<script lang="ts">
  import { ArrowDown, ArrowUp, Copy, GripVertical, MoreHorizontal, Pencil, Play, Scissors, Sparkles, Trash2 } from '@lucide/svelte';
  let {
    label, color, running = false, runnable = true, canMoveUp = true, canMoveDown = true, readOnly = false,
    onrun = () => undefined, onmoveup = () => undefined, onmovedown = () => undefined, onedit = () => undefined,
    onduplicate = () => undefined, oncut = () => undefined, ondelete = () => undefined
  }: {
    label: string; color: string; running?: boolean; runnable?: boolean; canMoveUp?: boolean; canMoveDown?: boolean; readOnly?: boolean;
    onrun?: () => void; onmoveup?: () => void; onmovedown?: () => void; onedit?: () => void;
    onduplicate?: () => void; oncut?: () => void; ondelete?: () => void;
  } = $props();
  let open = $state(false);
</script>

<div class="cell-toolbar">
  <div class="cell-kind"><GripVertical size={15} /><span style={`--dot:${color}`}></span>{label}</div>
  {#if !readOnly}<div class="actions">
    {#if runnable}<button class="run" disabled={running} aria-label="运行单元格" title="运行" onclick={onrun}><Play size={14} fill="currentColor" /></button><span class="action-separator"></span>{/if}
    <button class="tool" disabled={!canMoveUp} aria-label="上移单元格" title="上移" onclick={onmoveup}><ArrowUp size={15} /></button>
    <button class="tool" disabled={!canMoveDown} aria-label="下移单元格" title="下移" onclick={onmovedown}><ArrowDown size={15} /></button>
    <button class="tool edit" aria-label="编辑单元格" title="编辑" onclick={onedit}><Pencil size={14} /></button>
    <button class="tool danger-tool" aria-label="删除单元格" title="删除" onclick={ondelete}><Trash2 size={14} /></button>
    <div class="more">
      <button class="plain" aria-label="更多操作" onclick={() => open = !open}><MoreHorizontal size={17} /></button>
      {#if open}
        <div class="menu">
          <button onclick={() => { onduplicate(); open = false; }}><Copy size={14} /> 复制单元</button>
          <button onclick={() => { oncut(); open = false; }}><Scissors size={14} /> 剪切单元</button>
          <button class="placeholder" disabled><Sparkles size={14} /> <span>AI 解释<small>即将推出</small></span></button>
        </div>
      {/if}
    </div>
  </div>{/if}
</div>

<style>
  .cell-toolbar { height: 44px; display: flex; align-items: center; justify-content: space-between; padding: 0 12px 0 14px; border-bottom: 1px solid #deddd5; }
  .cell-kind { display: flex; align-items: center; gap: 7px; color: #747970; font-size: 10px; font-weight: 750; text-transform: uppercase; letter-spacing: .08em; }
  .cell-kind > span { width: 7px; height: 7px; border-radius: 50%; background: var(--dot); }
  .actions { display: flex; align-items: center; gap: 4px; }
  button { font: 600 11px 'DM Sans', system-ui, sans-serif; cursor: pointer; }
  .run { height: 27px; display: flex; align-items: center; gap: 6px; padding: 0 10px; border: 0; border-radius: 7px; background: #18211b; color: white; }
  .run:disabled { opacity: .55; }
  .action-separator { width: 1px; height: 18px; margin: 0 2px; background: #deddd5; }
  .tool { height: 27px; min-width: 28px; display: flex; align-items: center; justify-content: center; gap: 5px; border: 0; border-radius: 7px; padding: 0 7px; background: transparent; color: #747970; }.tool:hover:not(:disabled) { background: #ecebe4; color: #18211b; }.tool:disabled { opacity: .28; cursor: not-allowed; }.tool.danger-tool:hover { background: #fff0ed; color: #a54f42; }
  .plain { width: 28px; height: 27px; border: 0; border-radius: 7px; background: transparent; color: #747970; }
  .plain:hover { background: #ecebe4; color: #18211b; }
  .more { position: relative; }.menu { position: absolute; right: 0; top: 31px; z-index: 9; width: 166px; padding: 5px; border: 1px solid #deddd5; border-radius: 9px; background: white; box-shadow: 0 15px 40px #20291f20; }
  .menu button { width: 100%; display: flex; align-items: center; gap: 8px; border: 0; border-radius: 6px; padding: 7px 8px; background: transparent; color: #18211b; }
  .menu button:hover:not(:disabled) { background: #ecebe4; }.menu button.placeholder { margin-top: 3px; border-top: 1px solid #deddd5; border-radius: 0; color: #9b9e98; cursor: default; }.placeholder span { display: flex; flex: 1; align-items: center; justify-content: space-between; }.placeholder small { color: #b0b2ad; font-size: 8px; font-weight: 500; }
  @media (max-width: 760px) { .action-separator { display: none; }.cell-kind { font-size: 0; }.cell-kind > span { display: none; } }
</style>
