// Merged into next-pwa's sw.js automatically

self.addEventListener('push', (event: any) => {
  if (!event.data) return
  const data  = event.data.json()
  const title = data.title || 'Ridr'

  event.waitUntil(
    (self as any).registration.showNotification(title, {
      body:    data.body  || '',
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      vibrate: [200, 100, 200],
      tag:     data.type || 'ridr',   // prevents duplicate notifications
      renotify: true,                     // always show even if same tag
      data:    { url: data.url || '/', type: data.type },
    }).then(() => {
      // If app is open, also post message to trigger UI update
      return (self as any).clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clients: any[]) => {
          clients.forEach((client: any) => {
            client.postMessage({
              type: 'PUSH_RECEIVED',
              title,
              body: data.body,
              notifType: data.type,
              url: data.url,
            })
          })
        })
    })
  )
})

self.addEventListener('notificationclick', (event: any) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    (self as any).clients.matchAll({ type: 'window' }).then((list: any[]) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return (self as any).clients.openWindow(url)
    })
  )
})
