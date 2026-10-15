/* Ruta de Evacuación · © 2026 Bárbara del Pilar González Lucero. Todos los derechos reservados. */
/* Service worker: deja la guía disponible sin conexión.
   - La página: se pide a la red (para recibir versiones nuevas) y, si no hay red o tarda más de 3 s,
     se usa la copia guardada.
   - Datos de cada región (carpeta datos/): igual, pero se guardan en su propio caché, que no se borra
     al actualizar la página. Así el teléfono nunca queda sin datos.
   - Mosaicos del mapa: se guardan los que la persona ya vio (hasta 1500).
   - Si cambias sw.js, sube VERSION para forzar la actualización. */
const VERSION = 'evac-v10';
const TESELAS = 'evac-teselas';
const DATOS = 'evac-datos';
const MAX_TESELAS = 1500;
const NUCLEO = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './privacidad.html',
  './fuentes/AtkinsonHyperlegible-Regular.woff', './fuentes/AtkinsonHyperlegible-Bold.woff',
  './fuentes/BarlowCondensed-SemiBold.woff', './fuentes/BarlowCondensed-Bold.woff'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(NUCLEO)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => ![VERSION, TESELAS, DATOS].includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function conEspera(promesa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('lento')), ms);
    promesa.then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}
let contador = 0;
async function recortar(cache) {
  if (++contador % 50) return;
  const ks = await cache.keys();
  for (let i = 0; i < ks.length - MAX_TESELAS; i++) await cache.delete(ks[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    const esDato = /\/datos\/[^/]+\.json$/.test(url.pathname);
    e.respondWith((async () => {
      const cache = await caches.open(esDato ? DATOS : VERSION);
      const clave = esDato ? url.origin + url.pathname : req;   // un dato = una entrada, sin importar la versión
      const guardar = fetch(req).then((r) => { if (r.ok) cache.put(clave, r.clone()); return r; });
      guardar.catch(() => {});
      try { return await conEspera(guardar, esDato ? 6000 : 3000); } catch (_) {
        const copia = await cache.match(clave, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
        if (copia) return copia;
        return guardar; // sin copia: esperar a la red
      }
    })());
    return;
  }

  if (/(^|\.)tile\.openstreetmap\.org$|arcgisonline\.com$/.test(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open(TESELAS);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r.ok) { cache.put(req, r.clone()); recortar(cache); }
        return r;
      } catch (_) { return Response.error(); }
    })());
    return;
  }

});
