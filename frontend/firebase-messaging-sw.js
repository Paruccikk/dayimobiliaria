importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCteHYBI5mouYeQxAIeRB1NDMLZSjDvX_8",
  authDomain: "rdprimeimoveis-46b2f.firebaseapp.com",
  databaseURL: "https://rdprimeimoveis-46b2f-default-rtdb.firebaseio.com",
  projectId: "rdprimeimoveis-46b2f",
  storageBucket: "rdprimeimoveis-46b2f.firebasestorage.app",
  messagingSenderId: "219107441361",
  appId: "1:219107441361:web:ec2497a46521c5c5c9e3f0"
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || "Alerta Day";
  const options = {
    body: payload.notification?.body || "Tem uma nova oportunidade imobiliária para você.",
    data: { url: payload.data?.url || "/" },
    tag: payload.data?.campaignId || "alerta-day"
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if ("focus" in client) {
        client.navigate(target);
        return client.focus();
      }
    }
    return clients.openWindow(target);
  }));
});
