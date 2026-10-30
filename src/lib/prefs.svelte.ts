import { load, save } from './storage'

/** Small display preferences, kept on this device. */
export const prefs = $state({
  clock: load<'12' | '24'>('ontrack.clock', '12'),
  /** Detailed: coloured parks, water and roads. Minimal: quiet greyscale. Same tiles, same speed. */
  mapStyle: load<'detailed' | 'minimal'>('ontrack.mapStyle', 'detailed'),
})


export function setMapStyle(style: 'detailed' | 'minimal') {
  prefs.mapStyle = style
  save('ontrack.mapStyle', style)
}

export function setClock(clock: '12' | '24') {
  prefs.clock = clock
  save('ontrack.clock', clock)
}
