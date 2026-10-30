<script lang="ts">
  import { theme } from '../lib/theme.svelte'

  /**
   * A light wash over the map that follows the sun in Bonn: warm gold in the hour after
   * sunrise / before sunset, a pink-to-blue edge at dusk and dawn, a deep navy vignette at night.
   * One fixed gradient layer, never above ~20% strength, no pointer events.
   */
  const e = $derived(theme.elevation)
  const clamp = (x: number) => Math.max(0, Math.min(1, x))
  // Strength of each mood (0…1), fading smoothly across the sun's elevation.
  const golden = $derived(clamp((8 - e) / 4) * clamp((e + 1) / 2))      // ~ -1°…8°, peak 0…4°
  const blue = $derived(clamp((1 - e) / 3) * clamp((e + 8) / 3))        // ~ -8°…1°, peak -5…-2°
  const night = $derived(clamp((-5 - e) / 4))                           // below about -5°

  const style = $derived([
    golden > 0.01 && `radial-gradient(120% 70% at 50% 0%, rgb(255 176 92 / ${(0.2 * golden).toFixed(3)}), transparent 70%)`,
    blue > 0.01 && `linear-gradient(to bottom, rgb(255 140 170 / ${(0.1 * blue).toFixed(3)}), rgb(70 100 200 / ${(0.16 * blue).toFixed(3)}) 55%, transparent)`,
    night > 0.01 && `radial-gradient(140% 100% at 50% 30%, transparent 40%, rgb(8 14 40 / ${((theme.dark ? 0.35 : 0.2) * night).toFixed(3)}))`,
  ].filter(Boolean).join(', '))
</script>

{#if style}
  <div class="tint" style:background={style} aria-hidden="true"></div>
{/if}

<style>
  .tint {
    position: fixed; top: 0; left: 0; right: 0; z-index: 4; pointer-events: none;
    height: calc(var(--app-h, 100vh) + 120px);
    transition: background 2s linear;
  }
</style>
