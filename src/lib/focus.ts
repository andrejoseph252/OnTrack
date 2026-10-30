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
