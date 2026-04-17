<script lang="ts">
  import {
    preferences,
    updatePreference,
    resetPreferences,
    addCarouselImage,
    removeCarouselImage,
    updateCarouselImage,
  } from '$lib/stores/preferences.store';
  import { t, SUPPORTED_LANGUAGES } from '$lib/stores/i18n.store';

  let newSrc = '';
  let newCaption = '';

  function onAddImage() {
    if (!newSrc.trim()) return;
    addCarouselImage({ src: newSrc.trim(), caption: newCaption.trim() });
    newSrc = '';
    newCaption = '';
  }

  async function onFilePicked(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    for (const f of files) {
      const dataUrl = await fileToDataUrl(f);
      addCarouselImage({ src: dataUrl, caption: f.name });
    }
    input.value = '';
  }

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('read error'));
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.readAsDataURL(file);
    });
  }
</script>

<div class="max-w-2xl mx-auto space-y-8" data-testid="settings-root">
  <div>
    <h1 class="text-2xl font-bold text-surface-50">{$t('settings.title')}</h1>
    <p class="text-surface-400 mt-1">{$t('settings.subtitle')}</p>
  </div>

  <div class="space-y-6">
    <div class="p-4 rounded-lg bg-surface-800 border border-surface-700 space-y-4">
      <h2 class="text-lg font-medium text-surface-200">{$t('settings.appearance')}</h2>

      <div>
        <label for="theme" class="block text-sm text-surface-300 mb-1">{$t('settings.theme')}</label>
        <select
          id="theme"
          value={$preferences.theme}
          on:change={(e) => updatePreference('theme', e.currentTarget.value as 'dark' | 'light')}
          class="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600
                 text-surface-100 focus:outline-none focus:border-blue-500"
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>

      <div>
        <label for="navigation" class="block text-sm text-surface-300 mb-1">{$t('settings.navigation')}</label>
        <select
          id="navigation"
          value={$preferences.navigationLayout}
          on:change={(e) => updatePreference('navigationLayout', e.currentTarget.value as 'sidebar' | 'topbar')}
          class="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600
                 text-surface-100 focus:outline-none focus:border-blue-500"
        >
          <option value="sidebar">Sidebar</option>
          <option value="topbar">Top Bar</option>
        </select>
      </div>

      <div>
        <label for="lighting" class="block text-sm text-surface-300 mb-1">{$t('settings.lighting')}</label>
        <select
          id="lighting"
          value={$preferences.lightingPreset}
          on:change={(e) => updatePreference('lightingPreset', e.currentTarget.value)}
          class="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600
                 text-surface-100 focus:outline-none focus:border-blue-500"
        >
          <option value="nebula">Nebula</option>
          <option value="deep-space">Deep Space</option>
          <option value="aurora">Aurora</option>
          <option value="twilight">Twilight</option>
          <option value="cosmic-dawn">Cosmic Dawn</option>
        </select>
      </div>

      <div>
        <label for="language" class="block text-sm text-surface-300 mb-1">{$t('settings.language')}</label>
        <select
          id="language"
          value={$preferences.language}
          on:change={(e) => updatePreference('language', e.currentTarget.value as 'en' | 'es')}
          class="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600
                 text-surface-100 focus:outline-none focus:border-blue-500"
        >
          {#each SUPPORTED_LANGUAGES as lang}
            <option value={lang.code}>{lang.label}</option>
          {/each}
        </select>
        <p class="text-xs text-surface-500 mt-1">
          Navigation and Settings labels translate across English and Spanish.
          Other screens remain in English.
        </p>
      </div>

      <div>
        <label for="footer-text" class="block text-sm text-surface-300 mb-1">{$t('settings.footer')}</label>
        <input
          id="footer-text"
          type="text"
          maxlength="120"
          value={$preferences.footerText}
          on:input={(e) => updatePreference('footerText', e.currentTarget.value)}
          class="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600
                 text-surface-100 focus:outline-none focus:border-blue-500"
          data-testid="footer-text-input"
        />
      </div>
    </div>

    <div class="p-4 rounded-lg bg-surface-800 border border-surface-700 space-y-4">
      <h2 class="text-lg font-medium text-surface-200">{$t('settings.carousel')}</h2>

      {#if $preferences.carouselImages.length === 0}
        <p class="text-sm text-surface-500">{$t('settings.carousel.empty')}</p>
      {:else}
        <ul class="space-y-2" data-testid="carousel-list">
          {#each $preferences.carouselImages as image (image.id)}
            <li class="flex items-center gap-3 p-2 rounded bg-surface-900">
              <img src={image.src} alt={image.caption} class="w-16 h-12 object-cover rounded bg-surface-800" />
              <input
                class="flex-1 px-2 py-1 rounded bg-surface-700 border border-surface-600 text-xs text-surface-200"
                value={image.caption}
                on:input={(e) => updateCarouselImage(image.id, { caption: e.currentTarget.value })}
              />
              <button
                class="text-xs text-red-400 hover:text-red-300"
                on:click={() => removeCarouselImage(image.id)}
              >Remove</button>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="grid grid-cols-1 gap-2">
        <input
          type="text"
          placeholder="Image URL or paste data URL"
          bind:value={newSrc}
          class="px-3 py-2 rounded-lg bg-surface-700 border border-surface-600 text-sm text-surface-100"
        />
        <input
          type="text"
          placeholder="Caption"
          bind:value={newCaption}
          class="px-3 py-2 rounded-lg bg-surface-700 border border-surface-600 text-sm text-surface-100"
        />
        <div class="flex gap-2 items-center">
          <button
            class="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"
            on:click={onAddImage}
            disabled={!newSrc.trim()}
            data-testid="carousel-add"
          >
            {$t('settings.carousel.add')}
          </button>
          <label class="text-xs text-blue-300 hover:text-blue-200 cursor-pointer">
            or choose file(s)
            <input type="file" multiple accept="image/*" class="hidden" on:change={onFilePicked} />
          </label>
        </div>
      </div>
    </div>

    <div class="p-4 rounded-lg bg-surface-800 border border-surface-700 space-y-4">
      <h2 class="text-lg font-medium text-surface-200">{$t('settings.defaults')}</h2>

      <div>
        <label for="default-sort" class="block text-sm text-surface-300 mb-1">{$t('settings.defaultSort')}</label>
        <select
          id="default-sort"
          value={$preferences.defaultSort}
          on:change={(e) => updatePreference('defaultSort', e.currentTarget.value)}
          class="w-full px-3 py-2 rounded-lg bg-surface-700 border border-surface-600
                 text-surface-100 focus:outline-none focus:border-blue-500"
        >
          <option value="date_desc">Date (Newest)</option>
          <option value="date_asc">Date (Oldest)</option>
          <option value="title_asc">Title (A-Z)</option>
          <option value="title_desc">Title (Z-A)</option>
          <option value="mood_asc">Mood (Low-High)</option>
          <option value="mood_desc">Mood (High-Low)</option>
        </select>
      </div>
    </div>

    <div class="flex justify-end">
      <button
        class="px-4 py-2 rounded-lg bg-surface-700 text-surface-300 hover:bg-surface-600 transition-colors text-sm"
        on:click={resetPreferences}
      >
        {$t('settings.reset')}
      </button>
    </div>
  </div>
</div>
