<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Card, CardDraft } from '$lib/types/card';
  import { validateCardDraft, normalizeTags } from '$lib/utils/validation';

  export let card: Card | null = null;
  export let loading = false;

  const dispatch = createEventDispatcher<{
    save: { draft: CardDraft; version?: number };
    cancel: void;
  }>();

  let title = card?.title ?? '';
  let body = card?.body ?? '';
  let date = card?.date ?? new Date().toISOString().slice(0, 10);
  let mood = card?.mood ?? 3;
  let tagsInput = card?.tags.join(', ') ?? '';
  let errors: Record<string, string> = {};

  function handleSubmit() {
    const tags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const draft: CardDraft = {
      title,
      body,
      date,
      mood,
      tags,
    };

    const validationErrors = validateCardDraft(draft);
    errors = {};
    for (const e of validationErrors) {
      errors[e.field] = e.message;
    }

    if (validationErrors.length > 0) return;

    dispatch('save', {
      draft: { ...draft, tags: normalizeTags(tags) },
      version: card?.version,
    });
  }
</script>

<form on:submit|preventDefault={handleSubmit} class="space-y-4">
  <div>
    <label for="card-title" class="block text-sm text-surface-300 mb-1">
      Title <span class="text-surface-500">({title.trim().length}/30)</span>
    </label>
    <input
      id="card-title"
      type="text"
      bind:value={title}
      maxlength="30"
      class="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-600
             text-surface-100 focus:outline-none focus:border-blue-500"
      placeholder="Inspiration title"
      disabled={loading}
    />
    {#if errors.title}
      <p class="text-red-400 text-xs mt-1">{errors.title}</p>
    {/if}
  </div>

  <div>
    <label for="card-body" class="block text-sm text-surface-300 mb-1">
      Body <span class="text-surface-500">({body.trim().length}/500)</span>
    </label>
    <textarea
      id="card-body"
      bind:value={body}
      maxlength="500"
      rows="4"
      class="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-600
             text-surface-100 focus:outline-none focus:border-blue-500 resize-none"
      placeholder="Describe your inspiration..."
      disabled={loading}
    ></textarea>
    {#if errors.body}
      <p class="text-red-400 text-xs mt-1">{errors.body}</p>
    {/if}
  </div>

  <div class="grid grid-cols-2 gap-4">
    <div>
      <label for="card-date" class="block text-sm text-surface-300 mb-1">Date</label>
      <input
        id="card-date"
        type="date"
        bind:value={date}
        class="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-600
               text-surface-100 focus:outline-none focus:border-blue-500"
        disabled={loading}
      />
      {#if errors.date}
        <p class="text-red-400 text-xs mt-1">{errors.date}</p>
      {/if}
    </div>

    <div>
      <label for="card-mood" class="block text-sm text-surface-300 mb-1">
        Mood ({mood}/5)
      </label>
      <input
        id="card-mood"
        type="range"
        min="1"
        max="5"
        step="1"
        bind:value={mood}
        class="w-full mt-2"
        disabled={loading}
      />
      <div class="flex justify-between text-xs text-surface-500 mt-1">
        <span>Calm</span>
        <span>Passionate</span>
      </div>
      {#if errors.mood}
        <p class="text-red-400 text-xs mt-1">{errors.mood}</p>
      {/if}
    </div>
  </div>

  <div>
    <label for="card-tags" class="block text-sm text-surface-300 mb-1">
      Tags <span class="text-surface-500">(comma-separated, max 5)</span>
    </label>
    <input
      id="card-tags"
      type="text"
      bind:value={tagsInput}
      class="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-600
             text-surface-100 focus:outline-none focus:border-blue-500"
      placeholder="e.g., design, color, nature"
      disabled={loading}
    />
    {#if errors.tags}
      <p class="text-red-400 text-xs mt-1">{errors.tags}</p>
    {/if}
  </div>

  <div class="flex justify-end gap-3 pt-2">
    <button
      type="button"
      class="px-4 py-2 rounded-lg bg-surface-700 text-surface-300 hover:bg-surface-600 transition-colors"
      on:click={() => dispatch('cancel')}
      disabled={loading}
    >
      Cancel
    </button>
    <button
      type="submit"
      class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors
             disabled:opacity-50"
      disabled={loading}
    >
      {loading ? 'Saving...' : card ? 'Update' : 'Create'}
    </button>
  </div>
</form>
