<script lang="ts">
  import { duration, hm, metres } from '../lib/format'

  let { seconds, metresTotal, arrive, fastest, onclick }: {
    seconds: number
    metresTotal: number
    arrive: string | Date
    fastest: boolean
    onclick: () => void
  } = $props()
</script>

<!-- Walking the whole way: a slim green-tinted row among the route cards; solid green when fastest. -->
<button class="walkrow" class:fastest {onclick}>
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
    display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
    border: 0; border-radius: 14px; padding: 10px 12px; color: var(--text);
    background: color-mix(in srgb, var(--ok-soft) 70%, var(--surface));
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ok) 50%, transparent);
  }
  .walkrow.fastest { background: var(--ok-soft); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ok) 65%, transparent); }
  .walkrow:active { transform: scale(.99); }
  .ic { display: grid; place-items: center; flex: none; width: 30px; height: 30px; }
  .ic svg { width: 22px; height: 22px; fill: none; stroke: var(--ok); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .txt { flex: 1; min-width: 0; display: grid; }
  .txt b { font-weight: 650; }
  .txt small { color: var(--ok); font-size: 12.5px; }
  .chev { width: 16px; height: 16px; flex: none; fill: none; stroke: var(--muted); stroke-width: 2; }
</style>
