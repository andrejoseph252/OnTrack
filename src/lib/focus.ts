/**
 * Svelte action for text fields: focus on tap without iOS scrolling to the field.
 *
 * iOS scrolls the visual viewport to a field when it gets focus, then settles back as the
 * keyboard opens, which shows as a bounce even though the page can't scroll. We take over the
 * tap: cancel the native focus on touchend and focus with `preventScroll` in the same gesture
 * (so the keyboard still opens). Swipes that start on the field are left alone.
 */
export function noScrollFocus(input: HTMLInputElement) {
  let start: { x: number; y: number } | null = null

  const onStart = (e: TouchEvent) => {
    const t = e.touches[0]
    start = t ? { x: t.clientX, y: t.clientY } : null
  }
  const onEnd = (e: TouchEvent) => {
    const t = e.changedTouches[0]
    const moved = !start || !t || Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10
    start = null
    if (moved || document.activeElement === input) return
    e.preventDefault()
    input.focus({ preventScroll: true })
  }

  input.addEventListener('touchstart', onStart, { passive: true })
  input.addEventListener('touchend', onEnd, { passive: false })
  return {
    destroy() {
      input.removeEventListener('touchstart', onStart)
      input.removeEventListener('touchend', onEnd)
    },
  }
}

/**
 * Svelte action for suggestion buttons: select on finger-lift (or mouse-down).
 *
 * Waiting for `click`/`mousedown` on iOS means acting after the keyboard has begun closing: the
 * field blurs, the list closes and the layout shifts, so the tap is lost or lands elsewhere.
 * Taps are recognised on pointerup if the finger moved less than 10 px (scrolls are ignored).
 */
export function tapSelect(button: HTMLElement, onSelect: () => void) {
  let handler = onSelect
  let down: { x: number; y: number } | null = null
  /** Set when a tap was handled, so the touchend can cancel iOS's follow-up (ghost) click. */
  let handled = false
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') { e.preventDefault(); handler(); return } // keep focus; act at once
    down = { x: e.clientX, y: e.clientY }
  }
  const onUp = (e: PointerEvent) => {
    if (!down || e.pointerType === 'mouse') return
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10
    down = null
    if (moved) return
    e.preventDefault()
    handled = true
    handler()
  }
  // The list closes on select; without this, iOS's synthesized click lands on whatever is now
  // under the finger.
  const onTouchEnd = (e: TouchEvent) => { if (handled) { e.preventDefault(); handled = false } }
  const onCancel = () => (down = null)
  // Keyboard users (Enter/Space) get a click with detail 0.
  const onClick = (e: MouseEvent) => { if (e.detail === 0) handler() }
  button.addEventListener('pointerdown', onDown)
  button.addEventListener('pointerup', onUp)
  button.addEventListener('pointercancel', onCancel)
  button.addEventListener('touchend', onTouchEnd, { passive: false })
  button.addEventListener('click', onClick)
  return {
    update(fn: () => void) { handler = fn },
    destroy() {
      button.removeEventListener('pointerdown', onDown)
      button.removeEventListener('pointerup', onUp)
      button.removeEventListener('pointercancel', onCancel)
      button.removeEventListener('touchend', onTouchEnd)
      button.removeEventListener('click', onClick)
    },
  }
}
