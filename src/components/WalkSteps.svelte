<script lang="ts">
  import type { Leg } from '../lib/api/types'
  import { metres } from '../lib/format'

  let { leg }: { leg: Leg } = $props()

  const ARROW: Record<string, string> = {
    DEPART: '↑', CONTINUE: '↑', SLIGHTLY_LEFT: '↖', LEFT: '←', HARD_LEFT: '↙', SLIGHTLY_RIGHT: '↗', RIGHT: '→', HARD_RIGHT: '↘',
    UTURN_LEFT: '↶', UTURN_RIGHT: '↷', CIRCLE_CLOCKWISE: '⟳', CIRCLE_COUNTERCLOCKWISE: '⟲', STAIRS: '⇵', ELEVATOR: '⇅',
  }
  const TEXT: Record<string, string> = {
    DEPART: 'Head off', CONTINUE: 'Continue', SLIGHTLY_LEFT: 'Bear left', LEFT: 'Turn left', HARD_LEFT: 'Sharp left',
    SLIGHTLY_RIGHT: 'Bear right', RIGHT: 'Turn right', HARD_RIGHT: 'Sharp right', UTURN_LEFT: 'Turn around', UTURN_RIGHT: 'Turn around',
    STAIRS: 'Take the stairs', ELEVATOR: 'Take the lift', CIRCLE_CLOCKWISE: 'Go round', CIRCLE_COUNTERCLOCKWISE: 'Go round',
  }

  // Merge consecutive unnamed fragments so the list reads like directions, not a graph dump.
  const steps = $derived.by(() => {
    const out: { dir: string; name: string; dist: number; level?: string }[] = []
    for (const s of leg.steps ?? []) {
      const level = s.fromLevel !== s.toLevel ? `to level ${s.toLevel}` : undefined
      const prev = out.at(-1)
      if (prev && !level && !prev.level && (s.relativeDirection === 'CONTINUE' && (s.streetName === prev.name || !s.streetName))) {
        prev.dist += s.distance
        continue
      }
      out.push({ dir: s.relativeDirection, name: s.streetName, dist: s.distance, level })
    }
    return out.filter(s => s.dist >= 5 || s.level)
  })
</script>

<ol class="steps small">
  {#each steps as s, i (i)}
    <li>
      <span class="ar">{ARROW[s.dir] ?? '•'}</span>
      <span>
        {i === 0 && s.dir === 'CONTINUE' ? 'Head off' : TEXT[s.dir] ?? 'Continue'}
        {#if s.name}<span>on <b>{s.name}</b></span>{/if}
        {#if s.level}<b class="lvl">{s.level}</b>{/if}
      </span>
      <span class="muted tabular">{metres(s.dist)}</span>
    </li>
  {/each}
</ol>

<style>
  .steps { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 6px; }
  li { display: grid; grid-template-columns: 22px 1fr auto; gap: 6px; align-items: baseline; }
  .ar { text-align: center; color: var(--accent); font-weight: 700; }
  b { font-weight: 600; }
  .lvl { color: var(--warn); }
</style>
