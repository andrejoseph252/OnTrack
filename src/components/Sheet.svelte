<script lang="ts">
  import type { Snippet } from 'svelte'
  import { app, type Snap } from '../lib/state.svelte'

  let { children }: { children: Snippet } = $props()

  let vh = $state(window.innerHeight)
  let wide = $state(window.innerWidth >= 900)
  let drag = $state<{ startY: number; startH: number; h: number; lastY: number; lastT: number; v: number } | null>(null)
  let scroller: HTMLDivElement

  const PEEK = 112
  const heights = $derived({ peek: PEEK, half: Math.round(vh * 0.52), full: vh - 56 })
  const height = $derived(drag ? drag.h : heights[app.sheet])

  // Tell the map how much of the screen the sheet covers.
  $effect(() => { app.sheetPx = wide ? 0 : height })

  function onResize() {
    vh = window.innerHeight
    wide = window.innerWidth >= 900
  }

  // A press only becomes a drag after 8 px of movement, so taps on buttons still work.
  let pending: { y: number; el: HTMLElement; id: number } | null = null

  function start(e: PointerEvent, fromContent = false) {
    if (wide) return
    // From the content area, only take over when scrolled to top (pull down to collapse).
    if (fromContent && scroller.scrollTop > 0) return
    pending = { y: e.clientY, el: e.currentTarget as HTMLElement, id: e.pointerId }
  }

  function move(e: PointerEvent) {
    if (pending && !drag) {
      if (Math.abs(e.clientY - pending.y) < 8) return
      drag = { startY: pending.y, startH: height, h: height, lastY: e.clientY, lastT: e.timeStamp, v: 0 }
      pending.el.setPointerCapture(pending.id)
    }
    if (!drag) return
    const dy = e.clientY - drag.startY
    const dt = Math.max(1, e.timeStamp - drag.lastT)
    drag.v = (e.clientY - drag.lastY) / dt
    drag.lastY = e.clientY
    drag.lastT = e.timeStamp
    drag.h = Math.min(heights.full + 20, Math.max(PEEK - 30, drag.startH - dy))
  }

  let justDragged = false
  function end() {
    pending = null
    if (!drag) return
    justDragged = true
    setTimeout(() => (justDragged = false), 50)
    const { h, v } = drag
    drag = null
    const order: Snap[] = ['peek', 'half', 'full']
    // A flick moves one snap in its direction; otherwise snap to the nearest.
    if (Math.abs(v) > 0.5) {
      const nearestBelow = order.filter(s => heights[s] <= h).at(-1) ?? 'peek'
      const nearestAbove = order.find(s => heights[s] >= h) ?? 'full'
      app.sheet = v > 0 ? nearestBelow : nearestAbove
    } else {
      app.sheet = order.reduce((a, b) => (Math.abs(heights[b] - h) < Math.abs(heights[a] - h) ? b : a))
    }
  }

  function toggle() {
    app.sheet = app.sheet === 'peek' ? 'half' : app.sheet === 'half' ? 'full' : 'half'
  }
</script>

<svelte:window onresize={onResize} />

<section
  class="sheet"
  class:wide
  class:dragging={!!drag}
  style:height={wide ? null : `${heights.full}px`}
  style:transform={wide ? null : `translateY(${heights.full - height}px)`}
  aria-label="Panel"
>
  {#if !wide}
    <button class="grab" onpointerdown={e => start(e)} onpointermove={move} onpointerup={end} onpointercancel={end} onclick={() => { if (!justDragged) toggle() }} aria-label="Resize panel">
      <span></span>
    </button>
  {/if}
  <div
    role="presentation"
    class="content"
    class:locked={!wide && app.sheet !== 'full'}
    bind:this={scroller}
    onpointerdown={e => { if (e.pointerType === 'touch' && app.sheet !== 'full') start(e, true) }}
    onpointermove={move}
    onpointerup={end}
    onpointercancel={end}
  >
    {@render children()}
  </div>
</section>

<style>
  .sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 10;
    display: flex; flex-direction: column;
    background: var(--glass);
    -webkit-backdrop-filter: blur(22px) saturate(1.6);
    backdrop-filter: blur(22px) saturate(1.6);
    border-radius: 24px 24px 0 0;
    box-shadow: var(--shadow-lg);
    transition: transform .38s cubic-bezier(.2, .9, .25, 1);
    will-change: transform;
    max-width: 640px; margin: 0 auto;
  }
  .sheet.dragging { transition: none; }
  .grab {
    flex: none; height: 26px; border: 0; background: none; padding: 0;
    display: grid; place-items: center; touch-action: none; cursor: grab;
  }
  .grab span { width: 38px; height: 5px; border-radius: 3px; background: var(--surface-3); }
  .content {
    flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
    padding: 0 16px calc(24px + env(safe-area-inset-bottom));
    -webkit-overflow-scrolling: touch;
  }
  /* Below full height, vertical drags on content resize the sheet instead of scrolling. */
  .content.locked { touch-action: pan-x; }

  .sheet.wide {
    top: 12px; bottom: 12px; left: 12px; right: auto; width: 420px; margin: 0;
    border-radius: 22px; transform: none; box-shadow: var(--shadow);
  }
  .sheet.wide .content { padding-top: 16px; }
</style>
