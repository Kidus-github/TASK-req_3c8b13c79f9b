<script lang="ts">
  import { currentProfile, logout } from '$lib/stores/auth.store';
  import { t } from '$lib/stores/i18n.store';
</script>

<header class="h-14 bg-surface-800 border-b border-surface-700 flex items-center justify-between px-6" data-testid="topbar">
  <div class="text-sm text-surface-400 font-medium">
    NebulaForge
  </div>

  <div class="flex items-center gap-4">
    {#if $currentProfile}
      <span class="text-sm text-surface-300">{$currentProfile.username}</span>
      <button
        class="text-sm text-surface-400 hover:text-surface-200 transition-colors"
        on:click={logout}
      >
        {$t('app.lock')}
      </button>
    {/if}
  </div>
</header>
