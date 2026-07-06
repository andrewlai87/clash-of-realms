"use strict";

/*
 * sw.js — offline support for Clash of Realms.
 * Strategy: network-first for code (index/css/js — always fresh when online),
 * cache-first for the big immutable assets (models, vendor libs, icons).
 * Bump VERSION whenever cached assets must be invalidated.
 */
const VERSION = "cor-v1";

const CODE = [
  ".",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "js/engine.js",
  "js/pieces.js",
  "js/sound.js",
  "js/ai.js",
  "js3d/tween3d.js",
  "js3d/pieces3d.js",
  "js3d/board3d.js",
  "js3d/battle3d.js",
  "js3d/app3d.js",
];

const ASSETS = [
  "js3d/vendor/three.min.js",
  "js3d/vendor/GLTFLoader.js",
  "js3d/vendor/SkeletonUtils.js",
  "assets/icons/icon-180.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/models/Barbarian.glb",
  "assets/models/Knight.glb",
  "assets/models/Mage.glb",
  "assets/models/Rogue.glb",
  "assets/models/Skeleton_Warrior.glb",
  "assets/models/Skeleton_Mage.glb",
  "assets/models/Skeleton_Minion.glb",
  "assets/models/Skeleton_Rogue.glb",
  "assets/models/Skeleton_Blade.gltf",
  "assets/models/Skeleton_Blade.bin",
  "assets/models/Skeleton_Staff.gltf",
  "assets/models/Skeleton_Staff.bin",
  "assets/models/skeleton_texture.png",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll([...CODE, ...ASSETS])).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isAsset(url) {
  return url.includes("/assets/") || url.includes("/js3d/vendor/");
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;
  if (isAsset(req.url)) {
    // cache-first: these are big and effectively immutable
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(resp => {
        const copy = resp.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
        return resp;
      }))
    );
  } else {
    // network-first: pick up code changes when online, fall back offline
    e.respondWith(
      fetch(req).then(resp => {
        const copy = resp.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
        return resp;
      }).catch(() => caches.match(req, { ignoreSearch: true }))
    );
  }
});
