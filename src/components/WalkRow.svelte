<script lang="ts">
  import { duration, hm, metres } from '../lib/format'
  import { prefs, type WalkStyle } from '../lib/prefs.svelte'

  let { seconds, metresTotal, arrive, fastest, variant, onclick }: {
    seconds: number
    metresTotal: number
    arrive: string | Date
    fastest: boolean
    variant?: WalkStyle
    onclick: () => void
  } = $props()

  const v = $derived(variant ?? prefs.walkStyle)
</script>

<!-- Walking the whole way: a slim row among the route cards (style chosen in Settings). -->
<button class="walkrow v-{v}" class:fastest {onclick}>
  <span class="ic">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4" r="2" /><path d="m9 21 3-7 3 3v4M7 12l2-4 4-1 2 4 3 1M12 14l-1-4" /></svg>
  </span>
  <span class="txt">
    <b>Walk · {duration(seconds)}</b>
    <small>{fastest ? 'Fastest · ' : ''}{metresTotal ? `${metres(metresTotal)} · ` : ''}arrive {hm(arrive)}</small>
  </span>
  <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
</button>

<style>
  .walkrow {
    position: relative; overflow: hidden;
    display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
    border: 0; border-radius: 14px; padding: 10px 12px; color: var(--text);
    background: var(--surface); box-shadow: var(--shadow-sm);
  }
  .walkrow:active { transform: scale(.99); }
  .ic { display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 50%; }
  .ic svg { width: 22px; height: 22px; fill: none; stroke: var(--ok); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .txt { flex: 1; min-width: 0; display: grid; }
  .txt b { font-weight: 650; }
  .txt small { color: var(--muted); font-size: 12.5px; }
  .chev { width: 16px; height: 16px; flex: none; fill: none; stroke: var(--muted); stroke-width: 2; }

  /* A · Tint: pale green fill and outline */
  .v-a { background: color-mix(in srgb, var(--ok-soft) 70%, var(--surface)); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ok) 50%, transparent); }
  .v-a .txt small { color: var(--ok); }

  /* B · Accent bar: white card, solid green bar on the left */
  .v-b { padding-left: 16px; }
  .v-b::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: var(--ok); }

  /* C · Icon badge: the colour lives in a filled green circle */
  .v-c .ic { background: var(--ok); }
  .v-c .ic svg { stroke: var(--surface); width: 19px; height: 19px; }

  /* D · Path: dashed green outline, like walking paths on the map */
  .v-d { box-shadow: none; outline: 2px dashed color-mix(in srgb, var(--ok) 70%, transparent); outline-offset: -2px; }

  /* Fastest (all styles): solid soft-green fill and green text */
  .fastest { background: var(--ok-soft); }
  .fastest .txt small { color: var(--ok); }
  .fastest:not(.v-d):not(.v-b) { box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ok) 60%, transparent); }
</style>
