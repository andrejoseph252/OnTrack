<script lang="ts">
  import type { Itinerary } from '../lib/api/types'
  import { lineColors, lineName } from '../lib/lines'

  let { it }: { it: Itinerary } = $props()
  const total = $derived(it.legs.reduce((s, l) => s + Math.max(l.duration, 60), 0))
</script>

<div class="strip" aria-hidden="true">
  {#each it.legs as leg, i (i)}
    {#if leg.mode === 'WALK'}
      {#if leg.duration >= 120}<span class="walk" style:flex={Math.max(leg.duration, 60) / total}>🚶</span>{/if}
    {:else}
      {@const c = lineColors(leg)}
      <span class="seg" class:cancelled={leg.cancelled} style:flex={Math.max(leg.duration, 60) / total} style:background={c.bg} style:color={c.fg}>{lineName(leg)}</span>
    {/if}
  {/each}
</div>

<style>
  .strip { display: flex; gap: 3px; align-items: center; min-width: 0; }
  .seg {
    min-width: 34px; border-radius: 6px; padding: 2px 6px; font-size: 12px; font-weight: 700;
    overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: center;
  }
  .seg.cancelled { opacity: .4; text-decoration: line-through; }
  .walk { min-width: 18px; font-size: 12px; text-align: center; border-bottom: 2px dotted var(--walk); line-height: 16px; }
</style>
