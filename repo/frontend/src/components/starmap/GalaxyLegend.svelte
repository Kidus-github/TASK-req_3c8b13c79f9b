<script lang="ts">
  import { galaxyList } from '$lib/stores/starmap.store';
  import { tagToColor } from '$lib/utils/color';
</script>

<div class="absolute bottom-4 left-4 bg-surface-900/80 backdrop-blur-sm rounded-lg p-3 max-w-48">
  <h3 class="text-xs font-medium text-surface-300 mb-2">Galaxies</h3>
  {#if $galaxyList.length === 0}
    <p class="text-xs text-surface-500">No galaxies yet</p>
  {:else}
    <div class="space-y-1">
      {#each $galaxyList.slice(0, 10) as galaxy}
        <div class="flex items-center gap-2 text-xs">
          <span
            class="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style="background-color: {tagToColor(galaxy.tag)}"
          ></span>
          <span class="text-surface-300 truncate">{galaxy.tag}</span>
          <span class="text-surface-500 ml-auto">{galaxy.cardCount}</span>
        </div>
      {/each}
      {#if $galaxyList.length > 10}
        <p class="text-xs text-surface-500">+{$galaxyList.length - 10} more</p>
      {/if}
    </div>
  {/if}
</div>
