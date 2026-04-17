<script lang="ts">
  import Sidebar from './Sidebar.svelte';
  import Topbar from './Topbar.svelte';
  import TopbarNav from './TopbarNav.svelte';
  import { preferences } from '$lib/stores/preferences.store';
</script>

{#if $preferences.navigationLayout === 'topbar'}
  <div class="flex flex-col h-full" data-testid="shell-topbar">
    <Topbar />
    <TopbarNav />
    <main class="flex-1 overflow-auto p-6">
      <slot />
    </main>
    <footer class="px-6 py-3 border-t border-surface-700 text-xs text-surface-500" data-testid="app-footer">
      {$preferences.footerText}
    </footer>
  </div>
{:else}
  <div class="flex h-full" data-testid="shell-sidebar">
    <Sidebar />
    <div class="flex flex-col flex-1 min-w-0">
      <Topbar />
      <main class="flex-1 overflow-auto p-6">
        <slot />
      </main>
      <footer class="px-6 py-3 border-t border-surface-700 text-xs text-surface-500" data-testid="app-footer">
        {$preferences.footerText}
      </footer>
    </div>
  </div>
{/if}
