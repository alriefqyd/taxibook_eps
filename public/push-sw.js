self.addEventListener('install', function() { self.skipWaiting() })
self.addEventListener('activate', function() { self.clients.claim() })

self.addEventListener('push', function(event) {
  if (!event.data) return
  var data  = event.data.json()
  var title = data.title || 'TaxiBook'
  event.waitUntil(
    self.registration.showNotification(title, {
      body:    data.body  || '',
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      vibrate: [200, 100, 200],
      data:    { url: data.url || '/' }
    })
  )
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()
  var url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) {
          list[i].navigate(url)
          return list[i].focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
