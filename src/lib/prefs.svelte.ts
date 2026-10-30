import { load, save } from './storage'

/** Small display preferences, kept on this device. */
export const prefs = $state({
  clock: load<'12' | '24'>('ontrack.clock', '12'),
})

export function setClock(clock: '12' | '24') {
  prefs.clock = clock
  save('ontrack.clock', clock)
}
