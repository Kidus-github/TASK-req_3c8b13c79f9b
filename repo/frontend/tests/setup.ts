import 'fake-indexeddb/auto';
import { vi } from 'vitest';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';

// Mock Web Crypto API for Node/jsdom environment
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  const { webcrypto } = await import('crypto');
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: true,
  });
}

// Ensure crypto.randomUUID is available
if (typeof globalThis.crypto.randomUUID !== 'function') {
  const { webcrypto } = await import('crypto');
  globalThis.crypto.randomUUID = () => webcrypto.randomUUID();
}

// jsdom's Blob/File implementation has two problems for our tests:
//   1. It doesn't expose `arrayBuffer()` (only spec-required `size`/`type`).
//   2. After fake-indexeddb's structured-clone serialization round-trip, the
//      retrieved value is a plain Object — `instanceof Blob` is false and
//      every method/getter is gone.
// Replace the global Blob and File with node:buffer's implementations,
// which DO survive structuredClone and DO implement arrayBuffer()/text().
// Then provide a tiny FileReader polyfill that accepts these node Blobs
// (jsdom's FileReader is WebIDL-typed against jsdom's Blob and rejects ours).
(globalThis as any).Blob = NodeBlob;
(globalThis as any).File = NodeFile;

class TestFileReader extends EventTarget {
  static EMPTY = 0;
  static LOADING = 1;
  static DONE = 2;
  readyState = 0;
  result: string | ArrayBuffer | null = null;
  error: Error | null = null;
  onload: ((this: TestFileReader, ev: ProgressEvent) => void) | null = null;
  onerror: ((this: TestFileReader, ev: ProgressEvent) => void) | null = null;
  onloadend: ((this: TestFileReader, ev: ProgressEvent) => void) | null = null;

  private dispatch(name: 'load' | 'error' | 'loadend') {
    const ev = new Event(name) as ProgressEvent;
    this.dispatchEvent(ev);
    const handler = (this as any)[`on${name}`];
    if (typeof handler === 'function') handler.call(this, ev);
  }

  private async _read(blob: any, mode: 'text' | 'arrayBuffer' | 'dataURL'): Promise<void> {
    this.readyState = TestFileReader.LOADING;
    try {
      if (mode === 'text') {
        this.result = await blob.text();
      } else if (mode === 'arrayBuffer') {
        this.result = await blob.arrayBuffer();
      } else {
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
      }
      this.readyState = TestFileReader.DONE;
      this.dispatch('load');
    } catch (e) {
      this.error = e as Error;
      this.readyState = TestFileReader.DONE;
      this.dispatch('error');
    } finally {
      this.dispatch('loadend');
    }
  }

  readAsText(blob: any): void { void this._read(blob, 'text'); }
  readAsArrayBuffer(blob: any): void { void this._read(blob, 'arrayBuffer'); }
  readAsDataURL(blob: any): void { void this._read(blob, 'dataURL'); }
  abort(): void { this.readyState = TestFileReader.DONE; }
}
(globalThis as any).FileReader = TestFileReader;
