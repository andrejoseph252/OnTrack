<script lang="ts">
  import { onMount, type Snippet } from 'svelte'
  import { app, back, ROOT_VIEWS, type Snap } from '../lib/state.svelte'
  import { theme } from '../lib/theme.svelte'

  let { children }: { children: Snippet } = $props()

  let wide = $state(window.innerWidth >= 900)
  let safeTop = $state(0)
  let dragH = $state<number | null>(null)
  /** Horizontal offset while swiping back from the left edge. */
  let edgeX = $state(0)
  /** Snap without animating (used when a text field is focused). */
  let instant = $state(false)
  let sheet: HTMLElement
  let scroller: HTMLDivElement
  let probe: HTMLDivElement

  const PEEK = 118
  /** Map left visible above the panel at its top position (below the status bar). */
  const TOP_GAP = 64
  const vh = $derived(app.vh)
  const heights = $derived({ peek: PEEK, half: Math.round(vh * 0.5), full: vh - safeTop - TOP_GAP })
  const height = $derived(dragH ?? heights[app.sheet])

  // Tell the map how much of the screen the sheet covers.
  $effect(() => { app.sheetPx = wide ? 0 : height })

  /**
   * Real app height. A home-screen app with a translucent status bar reports a viewport
   * (innerHeight, 100%, bottom: 0) that is short by about the status bar, leaving a strip at
   * the bottom. There, the screen size is the truth; everything is sized from this value.
   */
  function measure() {
    const portrait = window.innerHeight >= window.innerWidth
    const screenH = portrait ? Math.max(screen.height, screen.width) : Math.min(screen.height, screen.width)
    app.vh = theme.standalone ? Math.max(window.innerHeight, screenH) : window.innerHeight
    document.documentElement.style.setProperty('--app-h', `${app.vh}px`)
    wide = window.innerWidth >= 900
    safeTop = probe?.offsetHeight ?? 0
  }
  measure()

  function snapTo(h: number, v: number) {
    const order: Snap[] = ['peek', 'half', 'full']
    // A flick moves on in its direction; otherwise snap to the nearest position.
    if (Math.abs(v) > 0.45) {
      app.sheet = v > 0 ? order.filter(s => heights[s] < h - 4).at(-1) ?? 'peek' : order.find(s => heights[s] > h + 4) ?? 'full'
    } else {
      app.sheet = order.reduce((a, b) => (Math.abs(heights[b] - h) < Math.abs(heights[a] - h) ? b : a))
    }
  }

  /**
   * Touch handling like a native sheet:
   * - below full height, any vertical drag on the sheet moves it;
   * - at full height, the content scrolls; pulling down while scrolled to the top moves the sheet;
   * - horizontal swipes (chip rows) are left alone, and taps are never intercepted.
   */
  onMount(() => {
    measure()

    // Typing: open the panel fully at once, before the keyboard arrives. Animating it while
    // iOS scrolls the page to the focused field pushed the panel off-screen. Any scroll iOS
    // adds anyway is undone; the fields sit at the top of the panel, above the keyboard.
    const settle = () => { if (window.scrollY || document.documentElement.scrollTop) window.scrollTo(0, 0) }
    const onFocusIn = (e: FocusEvent) => {
      if (wide || !(e.target as HTMLElement).matches?.('input, textarea')) return
      if (app.sheet !== 'full') {
        instant = true
        app.sheet = 'full'
        requestAnimationFrame(() => requestAnimationFrame(() => (instant = false)))
      }
      for (const ms of [0, 60, 300, 600]) setTimeout(settle, ms)
    }
    const onFocusOut = () => { for (const ms of [0, 300]) setTimeout(settle, ms) }
    sheet.addEventListener('focusin', onFocusIn)
    sheet.addEventListener('focusout', onFocusOut)
    window.visualViewport?.addEventListener('resize', settle)

    let t: { x: number; y: number; h: number; mode: 'undecided' | 'sheet' | 'native' | 'edge'; lastY: number; lastT: number; v: number } | null = null

    const start = (e: TouchEvent) => {
      if (wide || e.touches.length !== 1) return
      if ((e.target as HTMLElement).closest('input, textarea, select')) { t = null; return }
      const p = e.touches[0]
      // Swipe from the left edge goes back. Safari has its own edge gesture (driving our history
      // entries), so this is only needed in the home-screen app, where iOS has none.
      const edge = theme.standalone && p.clientX < 24 && !ROOT_VIEWS.includes(app.view)
      t = { x: p.clientX, y: p.clientY, h: heights[app.sheet], mode: edge ? 'edge' : 'undecided', lastY: p.clientY, lastT: e.timeStamp, v: 0 }
    }

    const move = (e: TouchEvent) => {
      if (!t) return
      const p = e.touches[0]
      const dx = p.clientX - t.x, dy = p.clientY - t.y
      if (t.mode === 'edge') {
        e.preventDefault()
        const dt = Math.max(1, e.timeStamp - t.lastT)
        t.v = (p.clientX - t.lastY) / dt
        t.lastY = p.clientX
        t.lastT = e.timeStamp
        edgeX = Math.max(0, dx)
        return
      }
      if (t.mode === 'undecided') {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        const fromHandle = (e.target as HTMLElement).closest('.grab')
        if (!fromHandle && Math.abs(dx) > Math.abs(dy)) t.mode = 'native'
        else if (fromHandle || app.sheet !== 'full') t.mode = 'sheet'
        else t.mode = scroller.scrollTop <= 0 && dy > 0 ? 'sheet' : 'native'
      }
      if (t.mode !== 'sheet') return
      e.preventDefault()
      const dt = Math.max(1, e.timeStamp - t.lastT)
      t.v = (p.clientY - t.lastY) / dt
      t.lastY = p.clientY
      t.lastT = e.timeStamp
      // Rubber-band slightly beyond the ends.
      const raw = t.h - dy
      dragH = raw > heights.full ? heights.full + (raw - heights.full) * 0.25 : raw < PEEK ? PEEK - (PEEK - raw) * 0.25 : raw
    }

    const end = () => {
      if (t?.mode === 'edge') {
        if (edgeX > 90 || (edgeX > 30 && t.v > 0.5)) back()
        edgeX = 0
      }
      if (t?.mode === 'sheet' && dragH !== null) snapTo(dragH, t.v)
      dragH = null
      t = null
    }

    sheet.addEventListener('touchstart', start, { passive: true })
    sheet.addEventListener('touchmove', move, { passive: false })
    sheet.addEventListener('touchend', end)
    sheet.addEventListener('touchcancel', end)
    return () => {
      sheet.removeEventListener('focusin', onFocusIn)
      sheet.removeEventListener('focusout', onFocusOut)
      window.visualViewport?.removeEventListener('resize', settle)
      sheet.removeEventListener('touchstart', start)
      sheet.removeEventListener('touchmove', move)
      sheet.removeEventListener('touchend', end)
      sheet.removeEventListener('touchcancel', end)
    }
  })

  // Mouse (desktop at phone width): drag the handle, or click it to toggle.
  let mouse: { y: number; h: number } | null = null
  function mouseDown(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || wide) return
    mouse = { y: e.clientY, h: height }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  function mouseMove(e: PointerEvent) {
    if (mouse) dragH = Math.max(PEEK, Math.min(heights.full, mouse.h - (e.clientY - mouse.y)))
  }
  function mouseUp(e: PointerEvent) {
    if (!mouse) return
    if (Math.abs(e.clientY - mouse.y) > 5 && dragH !== null) snapTo(dragH, 0)
    else app.sheet = app.sheet === 'full' ? 'half' : 'full'
    mouse = null
    dragH = null
  }

  // Back to the top of the content whenever the view changes.
  $effect(() => {
    void app.view
    if (scroller) scroller.scrollTop = 0
  })
</script>

<svelte:window onresize={measure} onorientationchange={measure} />
<div class="probe" bind:this={probe} aria-hidden="true"></div>

<section
  class="sheet"
  class:wide
  class:dragging={dragH !== null || instant}
  bind:this={sheet}
  style:height={wide ? null : `${heights.full}px`}
  style:--sheet-h={wide ? null : `${heights.full}px`}
  style:transform={wide ? null : `translateY(${heights.full - height}px)`}
  aria-label="Panel"
>
  {#if !wide}
    <div class="grab" role="button" tabindex="0" aria-label="Resize panel"
      onpointerdown={mouseDown} onpointermove={mouseMove} onpointerup={mouseUp}
      onkeydown={e => { if (e.key === 'Enter' || e.key === ' ') app.sheet = app.sheet === 'full' ? 'half' : 'full' }}>
      <span></span>
    </div>
  {/if}
  <div class="content" class:locked={!wide && app.sheet !== 'full'} class:swiping={edgeX > 0} bind:this={scroller}
    style:transform={edgeX ? `translateX(${edgeX}px)` : null} style:opacity={edgeX ? Math.max(0.4, 1 - edgeX / 400) : null}>
    {@render children()}
  </div>
</section>

<style>
  .probe { position: fixed; top: 0; left: 0; width: 0; height: env(safe-area-inset-top); pointer-events: none; visibility: hidden; }
  .sheet {
    /* Positioned from the top with the real app height, never bottom: 0 (see measure). */
    position: fixed; left: 0; right: 0; top: calc(var(--app-h, 100vh) - var(--sheet-h, 0px)); z-index: 10;
    display: flex; flex-direction: column;
    background: var(--glass);
    -webkit-backdrop-filter: blur(24px) saturate(1.6);
    backdrop-filter: blur(24px) saturate(1.6);
    border-radius: 26px 26px 0 0;
    box-shadow: var(--shadow-lg);
    transition: transform .42s cubic-bezier(.2, .9, .2, 1);
    will-change: transform;
    max-width: 640px; margin: 0 auto;
  }
  .sheet.dragging { transition: none; }
  /* Extend the panel's surface below the screen edge: iOS (home indicator, Safari toolbar,
     standalone viewport quirks) can leave a strip under position:fixed; bottom:0. */
  .sheet:not(.wide)::after {
    content: ''; position: absolute; left: 0; right: 0; top: 100%; height: 200px;
    background: var(--glass-solid); pointer-events: none;
  }
  .grab { flex: none; height: 24px; display: grid; place-items: center; cursor: grab; touch-action: none; }
  .grab span { width: 40px; height: 5px; border-radius: 3px; background: var(--surface-3); }
  .content {
    flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
    padding: 2px 16px calc(28px + env(safe-area-inset-bottom));
    -webkit-overflow-scrolling: touch;
  }
  .content { transition: transform .25s ease, opacity .25s ease; }
  .content.swiping { transition: none; }
  /* Below full height the sheet moves instead of the content scrolling. */
  .content.locked { overflow-y: hidden; }

  .sheet.wide {
    top: 12px !important; bottom: 12px; left: 12px; right: auto; width: 420px; margin: 0;
    border-radius: 22px; transform: none; box-shadow: var(--shadow);
  }
  .sheet.wide .content { padding-top: 16px; }
</style>
