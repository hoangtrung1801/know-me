const CACHE_NAME = "know-me-shell-v1";
const SHELL_URLS = [
	"/",
	"/index.html",
	"/manifest.webmanifest",
	"/pwa-192.png",
	"/pwa-512.png",
	"/favicon-16.png",
	"/favicon-32.png",
	"/logo.png",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then(async (cache) => {
			await cache.addAll(SHELL_URLS);
			const index = await fetch("/index.html");
			const html = await index.text();
			const assets = [...html.matchAll(/(?:src|href)=\"(\/assets\/[^\"]+)\"/g)].map((match) => match[1]);
			await Promise.all(assets.map((asset) => cache.add(asset)));
		})
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
			.then(() => self.clients.claim()),
	);
});

function isApiRequest(url) {
	return url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws/");
}

function isStaticAsset(url) {
	return url.pathname.startsWith("/assets/") || SHELL_URLS.includes(url.pathname);
}

self.addEventListener("fetch", (event) => {
	const request = event.request;
	const url = new URL(request.url);

	if (request.method !== "GET" || url.origin !== self.location.origin || isApiRequest(url)) {
		return;
	}

	if (request.mode === "navigate") {
		event.respondWith(
			fetch(request).catch(() => caches.match("/index.html")),
		);
		return;
	}

	if (isStaticAsset(url)) {
		event.respondWith(
			caches.match(request).then((cached) => cached || fetch(request).then((response) => {
				if (response.ok) {
					const copy = response.clone();
					void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
				}
				return response;
			})),
		);
	}
});
