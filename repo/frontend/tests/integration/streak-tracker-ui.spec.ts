import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';

import StreakTracker from '../../src/components/voyage/StreakTracker.svelte';

import { type NebulaDB, setDbFactory } from '$lib/db/connection';
import { createTestDb, destroyTestDb } from '../helpers/db-factory';
import { register, logout } from '$lib/stores/auth.store';
import { recordCardView } from '$lib/stores/voyage.store';

let testDb: NebulaDB;

beforeEach(async () => {
  testDb = createTestDb();
  setDbFactory(() => testDb);
  await register('demo', 'demopass1');
});

afterEach(async () => {
  logout();
  setDbFactory(null);
  await destroyTestDb(testDb);
});

describe('StreakTracker', () => {
  it('shows zero progress by default', () => {
    const { container } = render(StreakTracker);
    expect(container.textContent).toContain('0/10');
    expect(container.textContent).toContain('View distinct cards to complete today');
    expect(container.textContent).toContain('Current');
    expect(container.textContent).toContain('Longest');
    expect(container.textContent).toContain('Stardust');
  });

  it('shows completed-day progress after ten distinct card views', async () => {
    for (let i = 0; i < 10; i++) {
      await recordCardView(`card-${i}`);
    }

    const { container } = render(StreakTracker);
    await waitFor(() => {
      expect(container.textContent).toContain('10/10');
      expect(container.textContent).toContain('Day completed!');
      expect(container.textContent).toContain('1');
    });
  });
});
