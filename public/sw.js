const CACHE='wecapp-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/favicon.svg'])));self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 // Never cache authenticated records, live inventory, or payment requests.
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('/')));
 else if(url.pathname.startsWith('/assets/'))event.respondWith(caches.open(CACHE).then(async cache=>{const found=await cache.match(event.request);if(found)return found;const result=await fetch(event.request);if(result.ok)await cache.put(event.request,result.clone());return result;}));
});
