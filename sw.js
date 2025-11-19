// This file is not used directly because vite-plugin-pwa generates the service worker.
// Left here for reference if you want to roll your own.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})
