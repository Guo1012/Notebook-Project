<script lang="ts">
  import { onMount } from 'svelte';

  const PET = 64;
  const MARGIN = 16;
  const DRAG_THRESHOLD = 6;

  let { open = false, ontoggle }: { open?: boolean; ontoggle?: () => void } = $props();

  let x = $state(0);
  let y = $state(0);
  let ready = $state(false);

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  let moved = 0;

  function clamp(v: number, min: number, max: number) {
    return Math.min(Math.max(v, min), max);
  }

  onMount(() => {
    const place = () => {
      x = clamp(x, MARGIN, window.innerWidth - MARGIN - PET);
      y = clamp(y, MARGIN, window.innerHeight - MARGIN - PET);
      if (!ready) {
        x = window.innerWidth - MARGIN - PET;
        y = window.innerHeight - MARGIN - PET;
      }
      ready = true;
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  });

  function down(event: PointerEvent) {
    if (event.button !== 0) return;
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    originX = x;
    originY = y;
    moved = 0;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent) {
    if (!dragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
    x = clamp(originX + dx, MARGIN, window.innerWidth - MARGIN - PET);
    y = clamp(originY + dy, MARGIN, window.innerHeight - MARGIN - PET);
  }

  function up() {
    dragging = false;
    if (moved < DRAG_THRESHOLD) ontoggle?.();
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      ontoggle?.();
    }
  }
</script>

<div class="ai-pet" class:open style:left={`${x}px`} style:top={`${y}px`} style:opacity={ready ? 1 : 0}>
  <button
    class="pet-button"
    aria-label="AI 助手"
    aria-pressed={open}
    title="AI 助手"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onkeydown={keydown}
  >
    <span class="pet-bob">
      <svg width="42" height="42" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <line x1="32" y1="14" x2="32" y2="7" stroke="#506b58" stroke-width="2.4" stroke-linecap="round" />
        <circle cx="32" cy="5.5" r="3.4" fill="#d8a24a" />
        <path d="M15 27 L11 14 L25 20 Z" fill="#718d79" />
        <path d="M49 27 L53 14 L39 20 Z" fill="#718d79" />
        <circle cx="32" cy="38" r="22" fill="#7c9a85" />
        <ellipse cx="32" cy="47" rx="13" ry="9" fill="#e5ede5" />
        <circle cx="24" cy="36" r="4.6" fill="#18211b" />
        <circle cx="40" cy="36" r="4.6" fill="#18211b" />
        <circle cx="25.6" cy="34.4" r="1.7" fill="#ffffff" />
        <circle cx="41.6" cy="34.4" r="1.7" fill="#ffffff" />
        <ellipse cx="18" cy="42.5" rx="3.4" ry="2.2" fill="#c66f52" opacity="0.55" />
        <ellipse cx="46" cy="42.5" rx="3.4" ry="2.2" fill="#c66f52" opacity="0.55" />
        <path d="M29 45 Q32 48 35 45" stroke="#18211b" stroke-width="1.8" fill="none" stroke-linecap="round" />
      </svg>
    </span>
  </button>
</div>

<style>
  .ai-pet {
    position: fixed;
    left: 0;
    top: 0;
    width: 64px;
    height: 64px;
    z-index: 999;
    transition: opacity 0.25s ease;
  }
  .pet-button {
    width: 64px;
    height: 64px;
    display: grid;
    place-items: center;
    border: 1px solid var(--line);
    border-radius: 50%;
    background: radial-gradient(circle at 34% 28%, #ffffff, #eef2ec);
    box-shadow: 0 8px 24px #20291f2b, 0 2px 6px #20291f1a;
    cursor: grab;
    touch-action: none;
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  }
  .pet-button:hover { transform: scale(1.06); box-shadow: 0 14px 32px #20291f33; }
  .pet-button:active { cursor: grabbing; }
  .ai-pet.open .pet-button { border-color: var(--sage-dark); box-shadow: 0 0 0 3px #718d7922, 0 14px 32px #20291f33; }
  .pet-bob {
    display: grid;
    place-items: center;
    animation: bob 3.2s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes bob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
</style>
