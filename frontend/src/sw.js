import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

// 新版本一旦装好立即接管，不再卡在 waiting → 解决"网站一直不更新"（PWA 缓存旧版本）
self.skipWaiting()
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()) })

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

const BACKEND = self.location.origin   // 同源:http://…:3456 和 https://你的域名 都对(hub 自己 serve PWA+API 同源)

// Network-first for API calls
self.addEventListener('fetch', (event) => {
  if (event.request.url.startsWith(BACKEND)) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    )
  }
})

// Push notification handler
self.addEventListener('push', (event) => {
  let data = {}
  try { if (event.data) data = event.data.json() || {} } catch { /* 非 JSON payload：用默认标题兜底，不再抛错导致通知不显示 */ }
  event.waitUntil(
    (async () => {
      // App 关着也能让桌面图标亮起角标（iOS 显示圆点即可）
      try { if (self.navigator.setAppBadge) await self.navigator.setAppBadge(1) } catch {}
      await self.registration.showNotification(data.title || '小满来消息了', {
        body: data.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        // tag 用 charId，让同一角色的多条通知折叠成一条
        tag: data.tag || (data.charId ? `companion-${data.charId}` : 'companion-notification'),
        renotify: true,
        data: { url: data.url || '/', charId: data.charId || null },
      })
    })()
  )
})

// Notification click — 聚焦已开窗口并跳到对应角色，或新开窗口带上 ?chat=
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  const charId = event.notification.data?.charId || null
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((c) => c.url.includes(self.location.origin))
      if (existing) {
        existing.postMessage({ type: 'open-chat', charId })
        return existing.focus()
      }
      return clients.openWindow(url)
    })
  )
})
