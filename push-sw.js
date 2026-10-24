/* Voyajes v1.0 Web Push handler (imported into the Workbox service worker).
   Pushes are payload-less: on wake we ask the API what's new for this subscription. */
const VJ_API = "https://voyajes-api.yeshu501.workers.dev";
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let n = null;
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const r = await fetch(VJ_API + "/push/notices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub && sub.endpoint }) });
      n = ((await r.json()).notices || [])[0] || null;
    } catch (e) { /* fall through */ }
    const scope = self.registration.scope;
    await self.registration.showNotification(n ? n.title : "Voyajes", {
      body: n ? n.body : "Something new at your party",
      icon: scope + "pwa-192x192.png",
      badge: scope + "favicon-32x32.png",
      tag: n ? "vj-" + n.voyage_id + "-" + n.kind : "vj",
      data: { url: n ? n.url : scope },
    });
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) if ("focus" in w) { await w.navigate(url).catch(() => {}); return w.focus(); }
    return self.clients.openWindow(url);
  })());
});
