<script lang="ts">
  import { link } from 'svelte-spa-router';
  import { location } from 'svelte-spa-router';
  import { t } from '$lib/stores/i18n.store';
  import { preferences } from '$lib/stores/preferences.store';

  interface NavItem {
    href: string;
    key: string;
    icon: string;
  }

  const navItems: NavItem[] = [
    { href: '/', key: 'nav.dashboard', icon: '~' },
    { href: '/cards', key: 'nav.cards', icon: '#' },
    { href: '/starmap', key: 'nav.starmap', icon: '.' },
    { href: '/search', key: 'nav.search', icon: '?' },
    { href: '/voyage', key: 'nav.voyage', icon: '^' },
    { href: '/import', key: 'nav.import', icon: '+' },
    { href: '/backup', key: 'nav.backup', icon: '=' },
    { href: '/parser-rules', key: 'nav.parserRules', icon: '&' },
    { href: '/sdk-docs', key: 'nav.sdk', icon: '<' },
    { href: '/jobs', key: 'nav.jobs', icon: '>' },
    { href: '/settings', key: 'nav.settings', icon: '*' },
  ];
</script>

<aside class="w-56 bg-surface-800 border-r border-surface-700 flex flex-col" data-testid="sidebar">
  <div class="p-4 border-b border-surface-700">
    <h1 class="text-lg font-bold text-surface-100">NebulaForge</h1>
    <p class="text-xs text-surface-400">Creator Nebula</p>
  </div>

  <nav class="flex-1 py-4">
    {#each navItems as item}
      <a
        href={item.href}
        use:link
        class="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors
               {$location === item.href
                 ? 'bg-surface-700 text-surface-50 font-medium'
                 : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'}"
      >
        <span class="text-lg w-5 text-center">{item.icon}</span>
        {$t(item.key)}
      </a>
    {/each}
  </nav>

  <div class="p-4 border-t border-surface-700 text-xs text-surface-500" data-testid="sidebar-footer">
    {$preferences.footerText}
  </div>
</aside>
