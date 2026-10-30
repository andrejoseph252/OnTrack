import { load, save } from './storage'

/** Walking-row looks being tried out (temporary picker in Settings). */
export type WalkStyle = 'a' | 'b' | 'c' | 'd'

/** Small display preferences, kept on this device. */
export const prefs = $state({
  clock: load<'12' | '24'>('ontrack.clock', '12'),
  /** Detailed: coloured parks, water and roads. Minimal: quiet greyscale. Same tiles, same speed. */
  mapStyle: load<'detailed' | 'minimal'>('ontrack.mapStyle', 'detailed'),
  walkStyle: load<WalkStyle>('ontrack.walkStyle', 'a'),
})

export function setWalkStyle(style: WalkStyle) {
  prefs.walkStyle = style
  save('ontrack.walkStyle', style)
}

export function setMapStyle(style: 'detailed' | 'minimal') {
  prefs.mapStyle = style
  save('ontrack.mapStyle', style)
}

export function setClock(clock: '12' | '24') {
  prefs.clock = clock
  save('ontrack.clock', clock)
}
