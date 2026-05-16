const CACHE_NAME = 'jasin-svm-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/main.js',
  '/src/index.css',
  'https://fonts.googleapis.com/css2?family=Public+Sans:wght@300;400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght@100..700,0..1&display=swap',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDWwGR7DJvzhP62ZWPYWlNzsEj23ZgFasAa2ehNg6GvO6YGOpRt0ditv322jSi7Udy5ZgKXfq4Miy2F3MnfHx2yiCjbtVqoJhqCGx3VPPgWWb2zN1jXVv8xUa8EC5X6-YlK9XIU5-sOk8UHGoaivtkF9n3moBjXgoQ3vPDTsyHubWk665L1ImU7-3RIb1b66HCtMXCtwCn1Vkdb5ZBWET4OdeyGcY_yyKbyW0TB8So0VD4epZ0mO6_9kekWDHwEFk2Ez1CO20ZqmGlq'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
