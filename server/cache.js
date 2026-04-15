// Simple LRU-style Memory Cache Singleton
const cacheStore = new Map();
const DEFAULT_TTL = 1000 * 60 * 5; // 5 minutos de retención

module.exports = {
  get: (key) => {
    const data = cacheStore.get(key);
    if (!data) return null;
    if (Date.now() > data.expiry) {
      cacheStore.delete(key);
      return null;
    }
    return data.value;
  },
  set: (key, value, ttl = DEFAULT_TTL) => {
    cacheStore.set(key, { value, expiry: Date.now() + ttl });
  },
  del: (key) => {
    cacheStore.delete(key);
  },
  purgeMatch: (matchStr) => {
    // Busca llaves por regex/string parcial y las elimina
    for (let key of cacheStore.keys()) {
      if (key.includes(matchStr)) {
        cacheStore.delete(key);
      }
    }
  },
  clear: () => cacheStore.clear()
};
