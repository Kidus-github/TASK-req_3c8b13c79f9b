<script lang="ts">
  import { onMount } from 'svelte';
  import {
    login,
    register,
    checkExistingProfile,
    entryStatus,
    cooldownRemaining,
    error as authError,
    registering,
  } from '$lib/stores/auth.store';
  import { validateUsername, validatePassword } from '$lib/utils/validation';
  import LockoutNotice from './LockoutNotice.svelte';

  let username = '';
  let password = '';
  let confirmPassword = '';
  let hasExistingProfile = false;
  let fieldErrors: { username?: string; password?: string; confirm?: string } = {};
  let submitting = false;

  onMount(async () => {
    hasExistingProfile = await checkExistingProfile();
    if (!hasExistingProfile) {
      registering.set(true);
    }
  });

  function validateFields(): boolean {
    fieldErrors = {};
    const usernameErr = validateUsername(username);
    if (usernameErr) fieldErrors.username = usernameErr;

    const passwordErr = validatePassword(password);
    if (passwordErr) fieldErrors.password = passwordErr;

    if ($registering && password !== confirmPassword) {
      fieldErrors.confirm = 'Passwords do not match';
    }

    return Object.keys(fieldErrors).length === 0;
  }

  async function handleSubmit() {
    if (!validateFields()) return;
    submitting = true;

    if ($registering) {
      await register(username, password);
    } else {
      await login(username, password);
    }

    submitting = false;
  }

  function toggleMode() {
    registering.set(!$registering);
    fieldErrors = {};
  }
</script>

<div class="h-full flex items-center justify-center bg-surface-900">
  <div class="w-full max-w-md p-8">
    <div class="text-center mb-8">
      <h1 class="text-3xl font-bold text-surface-50 mb-2">NebulaForge</h1>
      <p class="text-surface-400 text-sm">Creator Nebula</p>
      <p class="text-surface-500 text-xs mt-2">
        Local device access gate. Your data stays on this device.
      </p>
    </div>

    {#if $entryStatus === 'cooldown'}
      <LockoutNotice remainingMs={$cooldownRemaining} />
    {/if}

    <form on:submit|preventDefault={handleSubmit} class="space-y-4">
      <div>
        <label for="username" class="block text-sm text-surface-300 mb-1">Username</label>
        <input
          id="username"
          type="text"
          bind:value={username}
          class="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-600
                 text-surface-100 focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="Enter username"
          disabled={submitting || $entryStatus === 'cooldown'}
          autocomplete="username"
        />
        {#if fieldErrors.username}
          <p class="text-red-400 text-xs mt-1">{fieldErrors.username}</p>
        {/if}
      </div>

      <div>
        <label for="password" class="block text-sm text-surface-300 mb-1">Password</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          class="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-600
                 text-surface-100 focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="8-20 characters, at least 1 number"
          disabled={submitting || $entryStatus === 'cooldown'}
          autocomplete={$registering ? 'new-password' : 'current-password'}
        />
        {#if fieldErrors.password}
          <p class="text-red-400 text-xs mt-1">{fieldErrors.password}</p>
        {/if}
      </div>

      {#if $registering}
        <div>
          <label for="confirm-password" class="block text-sm text-surface-300 mb-1">
            Confirm Password
          </label>
          <input
            id="confirm-password"
            type="password"
            bind:value={confirmPassword}
            class="w-full px-3 py-2 rounded-lg bg-surface-800 border border-surface-600
                   text-surface-100 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="Re-enter password"
            disabled={submitting}
            autocomplete="new-password"
          />
          {#if fieldErrors.confirm}
            <p class="text-red-400 text-xs mt-1">{fieldErrors.confirm}</p>
          {/if}
        </div>
      {/if}

      {#if $authError}
        <div class="bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-300">
          {$authError}
        </div>
      {/if}

      <button
        type="submit"
        class="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium
               transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={submitting || $entryStatus === 'cooldown'}
      >
        {#if submitting}
          Processing...
        {:else if $registering}
          Create Local Profile
        {:else}
          Unlock
        {/if}
      </button>
    </form>

    {#if hasExistingProfile}
      <div class="text-center mt-4">
        <button
          class="text-sm text-surface-400 hover:text-surface-200 transition-colors"
          on:click={toggleMode}
        >
          {$registering ? 'Already have a profile? Sign in' : 'Create a new profile'}
        </button>
      </div>
    {/if}
  </div>
</div>
