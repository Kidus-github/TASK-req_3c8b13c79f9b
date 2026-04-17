<script lang="ts">
  import Router, { location } from 'svelte-spa-router';
  import { isUnlocked } from '$lib/stores/auth.store';
  import LoginGate from './components/auth/LoginGate.svelte';
  import Shell from './components/layout/Shell.svelte';
  import Toaster from './components/layout/Toaster.svelte';
  import ProgressDrawer from './components/layout/ProgressDrawer.svelte';
  import { routes } from './routes/index';
  import { canAccessRoute, getRoleForUser } from '$lib/services/rbac.service';
  import { pushToast } from '$lib/stores/toast.store';
  import { logger } from '$lib/logging';
  import { loadVoyageData } from '$lib/stores/voyage.store';
  import { startWorkerHealthMonitor, stopWorkerHealthMonitor } from '$lib/services/worker-health.service';

  // Route guard: check RBAC permissions on navigation
  $: {
    const role = getRoleForUser($isUnlocked);
    if ($isUnlocked && $location && !canAccessRoute(role, $location)) {
      logger.warn('app', 'route-guard', `Blocked navigation to ${$location}`, { role });
      pushToast('Access denied', 'error');
    }
  }

  // Recalculate the voyage streak the moment a profile unlocks so a missed
  // day resets before any route reads the persisted value.
  let voyageLoaded = false;
  $: if ($isUnlocked && !voyageLoaded) {
    voyageLoaded = true;
    void loadVoyageData();
    startWorkerHealthMonitor();
  } else if (!$isUnlocked && voyageLoaded) {
    voyageLoaded = false;
    stopWorkerHealthMonitor();
  }
</script>

{#if $isUnlocked}
  <Shell>
    <Router {routes} />
  </Shell>
  <ProgressDrawer />
{:else}
  <LoginGate />
{/if}

<Toaster />
