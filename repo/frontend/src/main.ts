import './app.css';
import App from './App.svelte';
import { mount } from 'svelte';
import { syncService } from '$lib/services/sync.service';
import { markInterruptedJobs } from '$lib/services/worker-queue.service';

// Initialize multi-tab sync so edit locks and data-change broadcasts work.
syncService.init();

// Recover any jobs the browser killed mid-flight on the previous session.
markInterruptedJobs().catch(() => {});

// Register the service worker for offline/PWA support (only in real browsers).
if ('serviceWorker' in navigator && import.meta.env.MODE !== 'test') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((err) => {
      console.warn('[pwa] SW registration failed', err);
    });
  });
}

const app = mount(App, { target: document.getElementById('app')! });

export default app;
