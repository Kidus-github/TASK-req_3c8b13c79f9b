import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Shell from '../../../src/components/layout/Shell.svelte';
import Sidebar from '../../../src/components/layout/Sidebar.svelte';
import { updatePreference, resetPreferences } from '$lib/stores/preferences.store';

describe('Shell + Sidebar honor preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-nav');
    resetPreferences();
  });

  it('renders sidebar layout by default and shows the configured footer text', async () => {
    updatePreference('footerText', 'Custom footer here');
    await tick();

    const { getByTestId } = render(Shell);
    expect(getByTestId('shell-sidebar')).toBeTruthy();
    expect(getByTestId('app-footer').textContent).toContain('Custom footer here');
  });

  it('swaps to topbar layout when preferences say so', async () => {
    updatePreference('navigationLayout', 'topbar');
    await tick();

    const { getByTestId, queryByTestId } = render(Shell);
    expect(getByTestId('shell-topbar')).toBeTruthy();
    expect(queryByTestId('shell-sidebar')).toBeNull();
    expect(getByTestId('topbar-nav')).toBeTruthy();
  });

  it('sidebar nav labels follow the selected language', async () => {
    updatePreference('language', 'es');
    await tick();

    const { getByTestId, unmount } = render(Sidebar);
    expect(getByTestId('sidebar').textContent).toContain('Panel');
    unmount();

    updatePreference('language', 'en');
    await tick();

    const next = render(Sidebar);
    expect(next.getByTestId('sidebar').textContent).toContain('Dashboard');
  });
});
