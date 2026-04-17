<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { SceneManager, type StardustParticle } from '$lib/three/scene-manager';
  import { stars, highlighted, lighting, selectStar } from '$lib/stores/starmap.store';
  import { activeCards } from '$lib/stores/cards.store';
  import { refreshStarMap } from '$lib/stores/starmap.store';
  import { stardustUnlocked } from '$lib/stores/voyage.store';
  import { precomputeStardust } from '$lib/services/voyage.service';
  import type { StarNode, LightingPreset } from '$lib/types/starmap';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    starClick: StarNode;
  }>();

  let canvasEl: HTMLCanvasElement;
  let sceneManager: SceneManager | null = null;
  let stardustParticles: StardustParticle[] = [];
  let lastStardustState: boolean | null = null;

  onMount(() => {
    sceneManager = new SceneManager(canvasEl);
    sceneManager.onStarPick((star) => {
      if (star) {
        selectStar(star.id);
        dispatch('starClick', star);
      }
    });
  });

  onDestroy(() => {
    sceneManager?.dispose();
  });

  // React to card changes
  $: if ($activeCards && sceneManager) {
    refreshStarMap($activeCards);
  }

  // React to star node changes
  $: if ($stars && sceneManager) {
    sceneManager.updateStars($stars);
  }

  // React to highlight changes
  $: if (sceneManager) {
    if ($highlighted.length > 0) {
      sceneManager.highlightStars($highlighted);
    } else {
      sceneManager.clearHighlights();
    }
  }

  // React to lighting changes
  $: if (sceneManager && $lighting) {
    sceneManager.setLighting($lighting as LightingPreset);
  }

  // Stardust reward: pipe unlocked state into the render path and, when first
  // unlocked, hand off particle generation to the worker queue so the main
  // thread never tokenizes the halo.
  $: if (sceneManager && lastStardustState !== $stardustUnlocked) {
    lastStardustState = $stardustUnlocked;
    if (!$stardustUnlocked) {
      sceneManager.setStardustEnabled(false);
    } else if (stardustParticles.length > 0) {
      sceneManager.setStardustEnabled(true, stardustParticles);
    } else {
      // Fire-and-forget: show default particles immediately, then swap in
      // worker-precomputed particles when they arrive.
      sceneManager.setStardustEnabled(true);
      precomputeStardust({ kind: 'stardust', stardustUnlocked: true })
        .then((out) => {
          stardustParticles = out.particles;
          if (sceneManager && $stardustUnlocked && out.particles.length > 0) {
            sceneManager.setStardustEnabled(true, out.particles);
          }
        })
        .catch(() => { /* safe fallback; default particles stay in place */ });
    }
  }
</script>

<div class="w-full h-full relative">
  <canvas bind:this={canvasEl} class="w-full h-full block"></canvas>
</div>
