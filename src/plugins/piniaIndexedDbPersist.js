const DEFAULT_DB_NAME = 'llm-chat-box'
const DEFAULT_OBJECT_STORE = 'pinia-state'
const DEFAULT_WRITE_DEBOUNCE_MS = 250

const safeJsonParse = (value) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const getByPath = (obj, path) => {
  if (!path) return undefined
  return path
    .split('.')
    .reduce((acc, segment) => (acc !== undefined && acc !== null ? acc[segment] : undefined), obj)
}

const setByPath = (obj, path, value) => {
  const segments = path.split('.')
  const last = segments.pop()
  if (!last) return

  let cursor = obj
  for (const segment of segments) {
    if (typeof cursor[segment] !== 'object' || cursor[segment] === null) {
      cursor[segment] = {}
    }
    cursor = cursor[segment]
  }
  cursor[last] = value
}

const pickStatePaths = (state, paths) => {
  if (!Array.isArray(paths) || paths.length === 0) return state

  const partial = {}
  for (const path of paths) {
    const value = getByPath(state, path)
    if (value !== undefined) {
      setByPath(partial, path, value)
    }
  }
  return partial
}

const normalizePersistConfigs = (persistOptions) => {
  if (!persistOptions) return []
  if (persistOptions === true) return [{}]
  if (Array.isArray(persistOptions)) {
    return persistOptions.filter((item) => item && typeof item === 'object')
  }
  if (typeof persistOptions === 'object') return [persistOptions]
  return []
}

const createIndexedDbStorage = ({ dbName, objectStore }) => {
  let dbPromise = null
  let dbUnavailable = false

  const openDatabase = async () => {
    if (dbUnavailable) return null
    if (dbPromise) return dbPromise
    if (typeof window === 'undefined' || !window.indexedDB) {
      dbUnavailable = true
      return null
    }

    dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(dbName, 1)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(objectStore)) {
          db.createObjectStore(objectStore)
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'))
    }).catch((error) => {
      dbUnavailable = true
      console.warn('[Pinia IndexedDB Persist] IndexedDB 初始化失败，回退到 localStorage。', error)
      return null
    })

    return dbPromise
  }

  const runTransaction = async (mode, callback) => {
    const db = await openDatabase()
    if (!db) return null

    return new Promise((resolve, reject) => {
      const tx = db.transaction(objectStore, mode)
      const store = tx.objectStore(objectStore)
      callback(store, resolve, reject)
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'))
    }).catch((error) => {
      console.warn('[Pinia IndexedDB Persist] IndexedDB 读写失败，回退到 localStorage。', error)
      dbUnavailable = true
      return null
    })
  }

  const safeLocalStorageGet = (key) => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  }

  const safeLocalStorageSet = (key, value) => {
    try {
      window.localStorage.setItem(key, value)
    } catch (error) {
      console.warn('[Pinia IndexedDB Persist] localStorage 写入失败。', error)
    }
  }

  const safeLocalStorageRemove = (key) => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // no-op
    }
  }

  return {
    async getItem(key) {
      const db = await openDatabase()
      if (!db) {
        return safeLocalStorageGet(key)
      }

      const value = await runTransaction('readonly', (store, resolve, reject) => {
        const request = store.get(key)
        request.onsuccess = () => resolve(request.result ?? null)
        request.onerror = () => reject(request.error)
      })

      if (value !== null) return value

      // 首次切换到 IndexedDB 时，从 legacy localStorage 做一次迁移
      const legacy = safeLocalStorageGet(key)
      if (legacy !== null) {
        await this.setItem(key, legacy)
        safeLocalStorageRemove(key)
        return legacy
      }

      return null
    },

    async setItem(key, value) {
      const done = await runTransaction('readwrite', (store, resolve, reject) => {
        const request = store.put(value, key)
        request.onsuccess = () => resolve(true)
        request.onerror = () => reject(request.error)
      })

      if (done === null) {
        safeLocalStorageSet(key, value)
      }
    },

    async removeItem(key) {
      const done = await runTransaction('readwrite', (store, resolve, reject) => {
        const request = store.delete(key)
        request.onsuccess = () => resolve(true)
        request.onerror = () => reject(request.error)
      })

      if (done === null) {
        safeLocalStorageRemove(key)
      }
    },
  }
}

/**
 * Pinia 持久化插件（IndexedDB 版）
 *
 * 用法：
 * const pinia = createPinia()
 * pinia.use(createPiniaIndexedDbPersist())
 */
export const createPiniaIndexedDbPersist = (options = {}) => {
  const storage = createIndexedDbStorage({
    dbName: options.dbName || DEFAULT_DB_NAME,
    objectStore: options.objectStore || DEFAULT_OBJECT_STORE,
  })

  const debounceMs = options.debounceMs ?? DEFAULT_WRITE_DEBOUNCE_MS
  const timers = new Map()

  const schedulePersist = (key, serialized) => {
    const timer = timers.get(key)
    if (timer) {
      clearTimeout(timer)
    }

    const nextTimer = window.setTimeout(async () => {
      timers.delete(key)
      await storage.setItem(key, serialized)
    }, debounceMs)

    timers.set(key, nextTimer)
  }

  return ({ store, options: storeOptions }) => {
    const configs = normalizePersistConfigs(storeOptions?.persist)
    if (configs.length === 0) return

    for (const config of configs) {
      const key = config.key || store.$id
      const paths = Array.isArray(config.paths) ? config.paths : null

      // 先恢复，再订阅，避免启动时默认值覆盖已持久化数据
      ;(async () => {
        const raw = await storage.getItem(key)
        const parsed = safeJsonParse(raw)
        if (parsed && typeof parsed === 'object') {
          store.$patch(parsed)
        }

        store.$subscribe(
          (_mutation, state) => {
            const toPersist = pickStatePaths(state, paths)
            const serialized = JSON.stringify(toPersist)
            schedulePersist(key, serialized)
          },
          { detached: true },
        )
      })().catch((error) => {
        console.warn(`[Pinia IndexedDB Persist] 恢复 store(${store.$id}) 失败。`, error)
      })
    }
  }
}
