/* Crossy Road 3D 서비스워커 — 오프라인 셸 캐시
 * - 내비게이션: network-first, 실패 시 캐시된 index.html
 * - 그 외 같은 출처 GET: stale-while-revalidate (응답 ok일 때만 캐시)
 * 배포 내용이 바뀌어 캐시를 강제로 갈아엎어야 할 때 CACHE_VERSION을 올린다.
 */
const CACHE_VERSION = 'v1';
const CACHE_NAME = `crossy-road-3d-${CACHE_VERSION}`;
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('crossy-road-3d-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // 범위(scope) 밖 요청은 건드리지 않는다.
  if (!url.href.startsWith(self.registration.scope)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  // Range 요청(오디오·비디오 스트리밍)은 캐시하지 않고 그대로 통과시킨다.
  if (request.headers.has('range')) return;
  event.respondWith(staleWhileRevalidate(event, request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = (await cache.match(request, { ignoreSearch: true }))
      || (await cache.match(new URL('./index.html', self.registration.scope).href))
      || (await cache.match(self.registration.scope));
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    });
  if (cached) {
    event.waitUntil(network.catch(() => undefined));
    return cached;
  }
  return network;
}
