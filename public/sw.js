// Service worker de Urbania 360: muestra las notificaciones push
// (ej.: "el cliente aceptó el presupuesto") aunque la app esté cerrada.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { titulo: 'Urbania 360', mensaje: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Urbania 360', {
    body: d.mensaje || '',
    icon: '/img/apple-touch-icon.png',
    badge: '/favicon.png',
    tag: d.tag,
    renotify: !!d.tag,
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data.url || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin !== self.location.origin) continue;
      try { await w.focus(); return await w.navigate(url); } catch (err) { /* sin control: se abre una ventana nueva */ }
    }
    return self.clients.openWindow(url);
  })());
});
