<script lang="ts">
  import type { Itinerary } from '../lib/api/types'
  import { lineColors, lineName } from '../lib/lines'

  let { it }: { it: Itinerary } = $props()
  const total = $derived(it.legs.reduce((s, l) => s + Math.max(l.duration, 60), 0))
</script>

<div class="strip" aria-hidden="true">
  {#each it.legs as leg, i (i)}
    {#if leg.mode === 'WALK'}
      {#if leg.duration >= 120}<span class="walk" style:flex={Math.max(leg.duration, 60) / total}><svg class="wk" viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4" r="2" /><path d="m9 21 3-7 3 3v4M7 12l2-4 4-1 2 4 3 1M12 14l-1-4" /></svg></span>{/if}
    {:else}
      {@const c = lineColors(leg)}
      <span class="seg" class:cancelled={leg.cancelled} style:flex={Math.max(leg.duration, 60) / total} style:background={c.bg} style:color={c.fg}>{lineName(leg)}</span>
    {/if}
  {/each}
</div>

<style>
  .strip { display: flex; gap: 3px; align-items: center; min-width: 0; }
  .seg {
    min-width: 44px; flex-shrink: 0; border-radius: 7px; padding: 3px 6px; font-size: 12px; font-weight: 750;
    overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: center;
  }
  .seg.cancelled { opacity: .4; text-decoration: line-through; }
  .walk { min-width: 20px; flex-shrink: 1; display: grid; place-items: center; height: 20px; background-image: radial-gradient(circle, var(--walk) 1.2px, transparent 1.6px); background-size: 6px 6px; background-position: center; background-repeat: repeat-x; }
  .wk { width: 15px; height: 15px; padding: 1px; fill: none; stroke: var(--text-2); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; background: var(--surface); border-radius: 50%; }
</style>
