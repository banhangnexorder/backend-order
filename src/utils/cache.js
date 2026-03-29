const cache = new Map();

const TTL = 60 * 1000; // 60s

export function getCache(key) {
  const entry = cache.get(key);

  if (!entry) return null;

  const isExpired = Date.now() - entry.time > TTL;

  if (isExpired) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

export function setCache(key, data) {
  cache.set(key, {
    data,
    time: Date.now()
  });
}

export function clearCache(key) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}