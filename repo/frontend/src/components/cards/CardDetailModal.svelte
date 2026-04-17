<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Card } from '$lib/types/card';
  import CardDetail from './CardDetail.svelte';

  export let card: Card;

  const dispatch = createEventDispatcher<{
    close: void;
    edit: Card;
    delete: Card;
  }>();

  function handleBackdrop() {
    dispatch('close');
  }
</script>

<div
  class="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
  on:click|self={handleBackdrop}
  on:keydown={(e) => e.key === 'Escape' && dispatch('close')}
  role="dialog"
  aria-modal="true"
  aria-label="Star detail"
  tabindex="-1"
  data-testid="star-detail-modal"
>
  <div class="w-full max-w-xl bg-surface-900 rounded-lg border border-surface-700 p-6 max-h-[90vh] overflow-auto">
    <CardDetail
      {card}
      on:close
      on:edit
      on:delete
    />
  </div>
</div>
