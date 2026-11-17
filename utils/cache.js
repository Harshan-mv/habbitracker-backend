const { LRUCache } = require('lru-cache');

const positiveInt = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const cache = new LRUCache({
  max: positiveInt('CACHE_MAX_ENTRIES', 500),
  maxSize: positiveInt('CACHE_MAX_SIZE_BYTES', 5 * 1024 * 1024),
  sizeCalculation: (value) => Buffer.byteLength(JSON.stringify(value) ?? 'null', 'utf8'),
  ttl: positiveInt('CACHE_TTL_SECONDS', 45) * 1000,
});

const getOrSet = async (key, ttl, fetchFn) => {
  if (!/^user:[^:]+:/.test(key)) {
    throw new Error('Cache keys must include a user namespace');
  }
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const value = await fetchFn();
  const ttlMs = Number.isFinite(ttl) && ttl > 0
    ? ttl * 1000
    : positiveInt('CACHE_TTL_SECONDS', 45) * 1000;
  cache.set(key, value, { ttl: ttlMs });
  return value;
};

const invalidateUser = (userId) => {
  const prefix = `user:${userId}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
};

module.exports = { getOrSet, invalidateUser };
