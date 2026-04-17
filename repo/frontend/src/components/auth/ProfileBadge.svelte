<script lang="ts">
  import { currentProfile } from '$lib/stores/auth.store';
</script>

{#if $currentProfile}
  <div class="flex items-center gap-2">
    <div class="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
      {$currentProfile.username.charAt(0).toUpperCase()}
    </div>
    <span class="text-sm text-surface-300">{$currentProfile.username}</span>
  </div>
{/if}
