<script lang="ts">
  import { link, location } from 'svelte-spa-router';
  import { t } from '$lib/stores/i18n.store';

  const navItems = [
    { href: '/', key: 'nav.dashboard' },
    { href: '/cards', key: 'nav.cards' },
    { href: '/starmap', key: 'nav.starmap' },
    { href: '/search', key: 'nav.search' },
    { href: '/voyage', key: 'nav.voyage' },
    { href: '/import', key: 'nav.import' },
    { href: '/backup', key: 'nav.backup' },
    { href: '/parser-rules', key: 'nav.parserRules' },
    { href: '/sdk-docs', key: 'nav.sdk' },
    { href: '/jobs', key: 'nav.jobs' },
    { href: '/settings', key: 'nav.settings' },
  ];
</script>

<nav class="flex gap-1 overflow-x-auto px-4 py-2 bg-surface-800 border-b border-surface-700" data-testid="topbar-nav">
  {#each navItems as item}
    <a
      href={item.href}
      use:link
      class="px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors
             {$location === item.href
               ? 'bg-surface-700 text-surface-50 font-medium'
               : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'}"
    >
      {$t(item.key)}
    </a>
  {/each}
</nav>
