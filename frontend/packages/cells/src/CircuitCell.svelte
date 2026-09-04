<script lang="ts">
  import CellFrame from './CellFrame.svelte';
  import CellToolbar from './CellToolbar.svelte';
  import { OutputArea } from '@lumen/outputarea';
  import type { NormalizedCell } from '@lumen/nbformat';
  import type { CellToolbarActions } from './types';
  let { cell, trusted = false, showCellToolbar = true, actions = {} }: { cell: NormalizedCell; trusted?: boolean; showCellToolbar?: boolean; actions?: CellToolbarActions } = $props();
</script>

<CellFrame kind="Circuit" showToolbar={showCellToolbar}>
  {#snippet toolbar()}<CellToolbar label="Circuit" color="#7187a0" {...actions} />{/snippet}
  <div class="circuit-area">
    <div class="circuit-canvas" aria-label="电路编辑器占位">
      <div class="wire"><span class="q">q₀</span><i></i><b class="gate">H</b><i></i><span class="measure-dot"></span></div>
      <div class="wire"><span class="q">q₁</span><i></i><b class="control"></b><i></i><b class="gate measure">M</b></div>
      <div class="connector"></div>
    </div>
    <div class="coming-soon">
      <span class="badge">即将推出</span>
      <h3>电路工作台</h3>
      <p>可视化搭建、运行并观测量子电路。当前单元已为后续编辑器预留。</p>
    </div>
  </div>
  {#snippet outputs()}<OutputArea outputs={cell.outputs} {trusted} />{/snippet}
</CellFrame>

<style>
  .circuit-area { display: grid; grid-template-columns: 1.25fr .75fr; min-height: 178px; }
  .circuit-canvas { position: relative; display: grid; align-content: center; gap: 36px; padding: 28px 30px; overflow: hidden; background-color: #f8f8f4; background-image: radial-gradient(#cfd4cb 1px, transparent 1px); background-size: 16px 16px; border-right: 1px solid #e5e4df; }
  .wire { position: relative; z-index: 1; display: grid; grid-template-columns: 28px 1fr 32px 1fr 22px; align-items: center; color: #56635a; font: 11px ui-monospace, monospace; }
  .wire i { height: 1px; background: #91a096; }
  .q { font-weight: 600; }
  .gate { width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid #718d79; border-radius: 4px; background: #edf3ec; color: #496454; font: 700 11px ui-monospace, monospace; }
  .measure { border-color: #7187a0; background: #eef1f5; color: #50647b; }
  .control { width: 9px; height: 9px; justify-self: center; border-radius: 50%; background: #718d79; }
  .measure-dot { width: 9px; height: 9px; justify-self: center; border-radius: 50%; background: #7187a0; }
  .connector { position: absolute; left: calc(50% + 12px); top: 72px; width: 1px; height: 36px; background: #718d79; }
  .coming-soon { align-self: center; padding: 24px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #eef1f5; color: #667b91; font: 600 9px system-ui; text-transform: uppercase; letter-spacing: .1em; }
  .coming-soon h3 { margin: 13px 0 7px; font: 650 18px Georgia, 'Times New Roman', serif; }
  .coming-soon p { margin: 0; color: #8a8d86; font-size: 11px; line-height: 1.65; }
  @media (max-width: 720px) { .circuit-area { grid-template-columns: 1fr; } .circuit-canvas { border-right: 0; border-bottom: 1px solid #e5e4df; } .coming-soon { padding: 18px 24px; } }
</style>
