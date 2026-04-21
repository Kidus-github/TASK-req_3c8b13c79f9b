/**
 * Route-level coverage for routes/SDKDocs.svelte.
 *
 * These tests exercise the real component against real on-disk SDK assets for
 * happy paths, and assert the hardened error behavior for failed downloads.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import SDKDocs from '../../src/routes/SDKDocs.svelte';
import { clearToasts, toasts } from '$lib/stores/toast.store';

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(__dirname, '../../public/sdk/openapi-v1.json');
const bundlePath = resolve(__dirname, '../../public/sdk/nebulaforge-sdk.js');

const specBytes = readFileSync(specPath);
const bundleBytes = readFileSync(bundlePath);

function asResponse(bytes: Buffer, contentType: string, ok = true, status = 200) {
  const blob = new Blob([new Uint8Array(bytes)], { type: contentType });
  return {
    ok,
    status,
    headers: new Map([['content-type', contentType]]),
    blob: async () => blob,
    text: async () => blob.text(),
    arrayBuffer: async () => blob.arrayBuffer(),
  };
}

type AnchorRecord = {
  href: string;
  download: string;
  clickCount: number;
};
const capturedAnchors: AnchorRecord[] = [];

function installFetch(
  handler: (url: string) => Promise<ReturnType<typeof asResponse>> | ReturnType<typeof asResponse>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string) => handler(url));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  return fetchMock;
}

function installUrlShims(): { create: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> } {
  const create = vi.fn(() => `blob:fake-${Math.random()}`);
  const revoke = vi.fn();
  (URL as any).createObjectURL = create;
  (URL as any).revokeObjectURL = revoke;
  return { create, revoke };
}

function captureAnchorClicks(): void {
  capturedAnchors.length = 0;
  const origCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, opts?: ElementCreationOptions) => {
    const el = origCreate(tag as any, opts as any) as HTMLElement;
    if (tag.toLowerCase() === 'a') {
      const rec: AnchorRecord = { href: '', download: '', clickCount: 0 };
      capturedAnchors.push(rec);
      Object.defineProperty(el, 'href', {
        configurable: true,
        get: () => rec.href,
        set: (v: string) => { rec.href = v; },
      });
      Object.defineProperty(el, 'download', {
        configurable: true,
        get: () => rec.download,
        set: (v: string) => { rec.download = v; },
      });
      (el as HTMLAnchorElement).click = () => { rec.clickCount++; };
    }
    return el as unknown as HTMLElement;
  });
}

beforeEach(() => {
  capturedAnchors.length = 0;
  clearToasts();
});

afterEach(() => {
  clearToasts();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SDKDocs - real download wiring', () => {
  it('Download Spec fetches exactly /sdk/openapi-v1.json and serves the real on-disk OpenAPI file', async () => {
    const fetchMock = installFetch((url) => {
      expect(url).toBe('/sdk/openapi-v1.json');
      return asResponse(specBytes, 'application/json');
    });
    const urls = installUrlShims();
    captureAnchorClicks();

    const { findByRole } = render(SDKDocs);
    await fireEvent.click(await findByRole('button', { name: /Download Spec/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(urls.create).toHaveBeenCalled());
    expect(urls.revoke).toHaveBeenCalled();

    const [blobArg] = urls.create.mock.calls[0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect((blobArg as Blob).type).toBe('application/json');
    const text = await (blobArg as Blob).text();
    expect(JSON.parse(text).info.title).toBe('NebulaForge Star Map SDK');

    const anchor = capturedAnchors.find((a) => a.download.includes('nebulaforge-sdk-v'));
    expect(anchor).toBeTruthy();
    expect(anchor!.download).toBe('nebulaforge-sdk-v1.1.0.json');
    expect(anchor!.clickCount).toBe(1);
  });

  it('Download SDK Bundle fetches exactly /sdk/nebulaforge-sdk.js and serves the real on-disk bundle', async () => {
    const fetchMock = installFetch((url) => {
      expect(url).toBe('/sdk/nebulaforge-sdk.js');
      return asResponse(bundleBytes, 'text/javascript');
    });
    const urls = installUrlShims();
    captureAnchorClicks();

    const { findByRole } = render(SDKDocs);
    await fireEvent.click(await findByRole('button', { name: /Download SDK Bundle/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(urls.create).toHaveBeenCalled());

    const [blobArg] = urls.create.mock.calls[0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect((blobArg as Blob).type).toBe('text/javascript');
    const text = await (blobArg as Blob).text();
    expect(text).toMatch(/NebulaForge/);

    const anchor = capturedAnchors.find((a) => a.download === 'nebulaforge-sdk.js');
    expect(anchor).toBeTruthy();
    expect(anchor!.clickCount).toBe(1);
  });
});

describe('SDKDocs - failure paths', () => {
  it('Download Spec handles a rejecting fetch by surfacing an error toast and not creating a blob URL', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    const urls = installUrlShims();

    const { findByRole } = render(SDKDocs);
    await fireEvent.click(await findByRole('button', { name: /Download Spec/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(urls.create).not.toHaveBeenCalled();
    expect(urls.revoke).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(get(toasts).some((t) => /Failed to download SDK spec: offline/.test(t.message))).toBe(true);
    });
  });

  it('Download Spec rejects a 404 response, skips blob creation, and raises an error toast', async () => {
    const fetchMock = installFetch(() => asResponse(Buffer.from('not found'), 'text/plain', false, 404));
    const urls = installUrlShims();
    captureAnchorClicks();

    const { findByRole } = render(SDKDocs);
    await fireEvent.click(await findByRole('button', { name: /Download Spec/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(urls.create).not.toHaveBeenCalled();
    expect(capturedAnchors).toHaveLength(0);
    await waitFor(() => {
      expect(get(toasts).some((t) => /Failed to download SDK spec: Download failed \(404\)/.test(t.message))).toBe(true);
    });
  });

  it('Download Bundle request URL stays absolute and non-ok bundle responses also toast', async () => {
    const fetchMock = installFetch((url) => {
      expect(url).toBe('/sdk/nebulaforge-sdk.js');
      return asResponse(Buffer.from('boom'), 'text/plain', false, 503);
    });
    const urls = installUrlShims();
    captureAnchorClicks();

    const { findByRole } = render(SDKDocs);
    await fireEvent.click(await findByRole('button', { name: /Download SDK Bundle/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(urls.create).not.toHaveBeenCalled();
    expect(capturedAnchors).toHaveLength(0);
    await waitFor(() => {
      expect(get(toasts).some((t) => /Failed to download SDK bundle: Download failed \(503\)/.test(t.message))).toBe(true);
    });
  });
});

describe('SDKDocs - content-type expectations', () => {
  it('spec response is served as application/json and parses as OpenAPI 3.1', async () => {
    installFetch(() => asResponse(specBytes, 'application/json'));
    const urls = installUrlShims();
    captureAnchorClicks();

    const { findByRole } = render(SDKDocs);
    await fireEvent.click(await findByRole('button', { name: /Download Spec/i }));
    await waitFor(() => expect(urls.create).toHaveBeenCalled());

    const [blob] = urls.create.mock.calls[0] as [Blob];
    expect(blob.type).toBe('application/json');
    const parsed = JSON.parse(await blob.text());
    expect(parsed.openapi).toBe('3.1.0');
    expect(parsed.info.version).toBe('1.1.0');
  });

  it('bundle response is served as text/javascript and references NebulaForge', async () => {
    installFetch(() => asResponse(bundleBytes, 'text/javascript'));
    const urls = installUrlShims();
    captureAnchorClicks();

    const { findByRole } = render(SDKDocs);
    await fireEvent.click(await findByRole('button', { name: /Download SDK Bundle/i }));
    await waitFor(() => expect(urls.create).toHaveBeenCalled());

    const [blob] = urls.create.mock.calls[0] as [Blob];
    expect(blob.type).toBe('text/javascript');
    const text = await blob.text();
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/NebulaForge/);
  });
});
