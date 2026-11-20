/* Tablet storage (IndexedDB): settings/cache in "kv", unsent messages in "queue". Survives reloads and power loss. */
const DB_NAME = 'osc-kiosk', DB_VER = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' }).createIndex('at', 'at');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode), s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export const kv = {
  get: (k) => tx('kv', 'readonly', (s) => req(s.get(k))),
  set: (k, v) => tx('kv', 'readwrite', (s) => { s.put(v, k); }),
  del: (k) => tx('kv', 'readwrite', (s) => { s.delete(k); })
};

/** Queue items: {id, kind:'punch'|'unrec'|'enroll', at, payload, tries} */
export const queue = {
  add: (item) => tx('queue', 'readwrite', (s) => { s.put(Object.assign({ tries: 0 }, item)); }),
  all: () => tx('queue', 'readonly', (s) => req(s.index('at').getAll())),
  remove: (ids) => tx('queue', 'readwrite', (s) => { ids.forEach((id) => s.delete(id)); }),
  bump: (ids) => tx('queue', 'readwrite', async (s) => {
    for (const id of ids) { const it = await req(s.get(id)); if (it) { it.tries = (it.tries || 0) + 1; s.put(it); } }
  }),
  count: () => tx('queue', 'readonly', (s) => req(s.count()))
};
