<script lang="ts">
  import { onDestroy } from 'svelte';
  import { preferences } from '$lib/stores/preferences.store';

  let index = 0;
  let count = 0;

  const unsubscribe = preferences.subscribe(p => {
    count = p.carouselImages.length;
    if (index >= count) index = 0;
  });

  onDestroy(unsubscribe);

  let timer: ReturnType<typeof setInterval> | null = null;
  function startTimer() {
    stopTimer();
    if (count > 1) {
      timer = setInterval(() => {
        index = (index + 1) % count;
      }, 5000);
    }
  }
  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  $: if (count) startTimer(); else stopTimer();

  onDestroy(stopTimer);

  function prev() { if (count > 0) index = (index - 1 + count) % count; }
  function next() { if (count > 0) index = (index + 1) % count; }
</script>

{#if $preferences.carouselImages.length > 0}
  <div class="rounded-lg overflow-hidden border border-surface-700 bg-surface-800" data-testid="preferences-carousel">
    <div class="relative">
      {#key index}
        <img
          src={$preferences.carouselImages[index].src}
          alt={$preferences.carouselImages[index].caption}
          class="w-full h-48 object-cover bg-surface-900"
          data-testid="carousel-image"
        />
      {/key}
      <div class="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent text-white text-sm">
        {$preferences.carouselImages[index].caption}
      </div>
      {#if $preferences.carouselImages.length > 1}
        <button
          class="absolute left-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-full bg-black/40 text-white text-sm"
          on:click={prev}
          aria-label="Previous"
        >‹</button>
        <button
          class="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-full bg-black/40 text-white text-sm"
          on:click={next}
          aria-label="Next"
        >›</button>
      {/if}
    </div>
    <div class="px-3 py-1 text-xs text-surface-500">
      {index + 1} / {$preferences.carouselImages.length}
    </div>
  </div>
{/if}
