// Merged into next-pwa's sw.js automatically

self.addEventListener('push', (event: any) => {
  if (!event.data) return
  const data  = event.data.json()
  const title = data.title || 'TaxiBook'
  event.waitUntil(
    (self as any).registration.showNotification(title, {
      body:    data.body  || '',
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      vibrate: [200, 100, 200],
      data:    { url: data.url || '/' },
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
