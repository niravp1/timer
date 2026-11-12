const cacheName = 'focus-tracker-avatars-v1'

function avatarKey(account: string) {
  return new URL(`/__avatar-cache/${encodeURIComponent(account)}`, location.origin)
}

export async function readCachedAvatar(account: string) {
  try {
    const cache = await caches.open(cacheName)
    return await (await cache.match(avatarKey(account)))?.blob()
  } catch {
    return undefined
  }
}

export async function rememberAvatar(account: string, photo: Blob) {
  try {
    const cache = await caches.open(cacheName)
    await cache.put(avatarKey(account), new Response(photo))
  } catch {
    // The current picture still works when the browser disables its cache.
  }
}
