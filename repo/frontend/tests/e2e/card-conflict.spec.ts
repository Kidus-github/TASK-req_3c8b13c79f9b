/**
 * E2E: Card edit conflict resolution.
 *
 * Forces an optimistic-concurrency conflict by loading a card in the editor,
 * then bumping its version directly in IndexedDB, then submitting the edit.
 * Asserts the conflict modal appears and that resolution returns the user
 * to a consistent state.
 */
import { test, expect, type Page } from '@playwright/test';

const DEMO_USER = 'demo';
const DEMO_PASS = 'demopass1';

async function clearAppState(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    try { window.localStorage.clear(); } catch {}
    try { window.sessionStorage.clear(); } catch {}
    const dbs = ((await (indexedDB as any).databases?.()) ?? []) as { name?: string }[];
    await Promise.all(
      dbs.filter((d) => d.name).map(
        (d) => new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(d.name as string);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        })
      )
    );
  });
  await page.reload();
}

async function unlockDemoProfile(page: Page) {
  await clearAppState(page);
  await page.getByLabel(/Username/).fill(DEMO_USER);
  await page.getByLabel(/^Password$/).fill(DEMO_PASS);
  await page.getByLabel(/Confirm Password/).fill(DEMO_PASS);
  await page.getByRole('button', { name: /Create Local Profile/i }).click();
  await expect(page.getByRole('heading', { name: /Welcome, demo/ })).toBeVisible();
}

test.describe('Card edit conflict resolution', () => {
  test.beforeEach(async ({ page }) => {
    await unlockDemoProfile(page);
  });

  test('shows the conflict modal when the card version has advanced behind our back', async ({ page }) => {
    await page.goto('#/cards');
    await expect(page.getByRole('heading', { name: /^Cards$/ })).toBeVisible();

    // Create a card via the New Card flow
    await page.getByRole('button', { name: /New Card/i }).click();
    const titleInput = page.locator('#card-title');
    const bodyInput = page.locator('#card-body');
    await titleInput.fill('Conflict Card');
    await bodyInput.fill('Initial body');
    await page.getByRole('button', { name: /^Save$/i }).click();
    await expect(page.locator('body')).toContainText(/Conflict Card/);

    // Open the card and switch to Edit
    await page.getByText('Conflict Card').first().click();
    const editBtn = page.getByRole('button', { name: /^Edit$/i }).first();
    await editBtn.click();

    // Bump the card's version in IndexedDB so the next save sees stale state
    await page.evaluate(async () => {
      const open = indexedDB.open('nebulaforge');
      await new Promise<void>((resolve) => { open.onsuccess = () => resolve(); open.onerror = () => resolve(); });
      const db = open.result;
      const tx = db.transaction('cards', 'readwrite');
      const store = tx.objectStore('cards');
      const all = await new Promise<any[]>((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve([]);
      });
      const target = all.find((c) => c.title === 'Conflict Card');
      if (target) {
        target.version = (target.version ?? 1) + 5;
        target.title = 'Changed By Other Tab';
        target.updatedAt = Date.now();
        store.put(target);
      }
      await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); });
      db.close();
    });

    // Modify the editor and try to save
    await page.locator('#card-body').fill('Stale edit body');
    await page.getByRole('button', { name: /^Save$/i }).click();

    // The conflict modal renders with both version numbers
    await expect(page.getByText(/Version Conflict/i)).toBeVisible({ timeout: 10_000 });
    // Reload card path is offered
    const reload = page.getByRole('button', { name: /Reload Card/i });
    await expect(reload).toBeVisible();
    await reload.click();

    // After reload, the editor should show the other tab's title
    await expect(page.locator('body')).toContainText(/Changed By Other Tab/i);
  });
});
