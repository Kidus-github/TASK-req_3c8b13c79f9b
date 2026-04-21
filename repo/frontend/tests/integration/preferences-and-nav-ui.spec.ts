import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

import PreferencesCarousel from '../../src/components/layout/PreferencesCarousel.svelte';
import TopbarNav from '../../src/components/layout/TopbarNav.svelte';

import { addCarouselImage, resetPreferences, updatePreference } from '$lib/stores/preferences.store';

beforeEach(() => {
  localStorage.clear();
  resetPreferences();
});

afterEach(() => {
  resetPreferences();
  vi.useRealTimers();
});

describe('PreferencesCarousel', () => {
  it('renders nothing with no configured images', () => {
    const { queryByTestId } = render(PreferencesCarousel);
    expect(queryByTestId('preferences-carousel')).toBeNull();
  });

  it('renders images, supports prev/next, and auto-rotates', async () => {
    vi.useFakeTimers();
    addCarouselImage({ src: '/img/1.jpg', caption: 'First' });
    addCarouselImage({ src: '/img/2.jpg', caption: 'Second' });

    const { getByTestId, getByLabelText, container } = render(PreferencesCarousel);

    expect(getByTestId('carousel-image').getAttribute('src')).toBe('/img/1.jpg');
    expect(container.textContent).toContain('First');
    expect(container.textContent).toContain('1 / 2');

    await fireEvent.click(getByLabelText('Next'));
    expect(getByTestId('carousel-image').getAttribute('src')).toBe('/img/2.jpg');
    expect(container.textContent).toContain('2 / 2');

    await fireEvent.click(getByLabelText('Previous'));
    expect(getByTestId('carousel-image').getAttribute('src')).toBe('/img/1.jpg');

    await vi.advanceTimersByTimeAsync(5000);
    await waitFor(() => {
      expect(getByTestId('carousel-image').getAttribute('src')).toBe('/img/2.jpg');
    });
  });
});

describe('TopbarNav', () => {
  it('renders the default English navigation labels', () => {
    const { container, getByText } = render(TopbarNav);

    expect(container.querySelector('[data-testid="topbar-nav"]')).toBeTruthy();
    expect(getByText('Dashboard')).toBeTruthy();
    expect(getByText('Cards')).toBeTruthy();
    expect(getByText('Star Map')).toBeTruthy();
    expect(getByText('Settings')).toBeTruthy();
  });

  it('switches labels when preferences language changes to Spanish', async () => {
    updatePreference('language', 'es');
    const { getByText } = render(TopbarNav);

    expect(getByText('Panel')).toBeTruthy();
    expect(getByText('Tarjetas')).toBeTruthy();
    expect(getByText('Ajustes')).toBeTruthy();
  });
});
