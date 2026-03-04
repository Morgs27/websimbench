import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BenchmarkEntry {
  id: string;
  timestamp: number;
  label: string;
  agentCounts: number[];
  methods: string[];
  frameCount: number;
  /** Lightweight summary stored inline; full report is a separate Blob. */
  summary: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

const DB_NAME = "websimbench-benchmarks";
const DB_VERSION = 2;
const META_STORE = "meta";
const BLOB_STORE = "blobs";
/** Per-run report blobs, keyed by `{suiteId}:{runIndex}`. */
const RUN_BLOB_STORE = "run-blobs";

export const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE);
      }
      if (!db.objectStoreNames.contains(RUN_BLOB_STORE)) {
        db.createObjectStore(RUN_BLOB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const txStore = (
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
): IDBObjectStore => db.transaction(store, mode).objectStore(store);

const idbPut = <T>(store: IDBObjectStore, value: T, key?: IDBValidKey) =>
  new Promise<void>((resolve, reject) => {
    const req = key !== undefined ? store.put(value, key) : store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

const idbGetAll = <T>(store: IDBObjectStore) =>
  new Promise<T[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });

const idbGet = <T>(store: IDBObjectStore, key: IDBValidKey) =>
  new Promise<T | undefined>((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });

const idbDelete = (store: IDBObjectStore, key: IDBValidKey) =>
  new Promise<void>((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

// ---------------------------------------------------------------------------
// Standalone helpers (callable outside of React)
// ---------------------------------------------------------------------------

/**
 * Save an individual run's report blob to IndexedDB immediately.
 * Key format: `{suiteId}:{runIndex}`.
 */
export const saveRunBlob = async (
  suiteId: string,
  runIndex: number,
  blob: Blob,
): Promise<string> => {
  const key = `${suiteId}:${runIndex}`;
  const db = await openDB();
  await idbPut(txStore(db, RUN_BLOB_STORE, "readwrite"), blob, key);
  return key;
};

/**
 * Retrieve a single run blob by its key.
 */
export const getRunBlob = async (key: string): Promise<Blob | undefined> => {
  const db = await openDB();
  return idbGet<Blob>(txStore(db, RUN_BLOB_STORE, "readonly"), key);
};

/**
 * Retrieve all run blobs for a suite, in order.
 */
export const getRunBlobs = async (
  suiteId: string,
  runCount: number,
): Promise<(Blob | undefined)[]> => {
  const db = await openDB();
  const results: (Blob | undefined)[] = [];
  for (let i = 0; i < runCount; i++) {
    const key = `${suiteId}:${i}`;
    results.push(
      await idbGet<Blob>(txStore(db, RUN_BLOB_STORE, "readonly"), key),
    );
  }
  return results;
};

/**
 * Delete all run blobs for a suite.
 */
export const deleteRunBlobs = async (
  suiteId: string,
  runCount: number,
): Promise<void> => {
  const db = await openDB();
  const store = txStore(db, RUN_BLOB_STORE, "readwrite");
  for (let i = 0; i < runCount; i++) {
    await idbDelete(store, `${suiteId}:${i}`);
  }
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React hook for persisting benchmark results in IndexedDB.
 *
 * Stores lightweight metadata separately from the full JSON report blob,
 * making the recent-benchmarks list fast to load.
 */
export function useBenchmarkDB() {
  const [entries, setEntries] = useState<BenchmarkEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const db = await openDB();
      const all = await idbGetAll<BenchmarkEntry>(
        txStore(db, META_STORE, "readonly"),
      );
      // Sort newest-first
      all.sort((a, b) => b.timestamp - a.timestamp);
      setEntries(all.slice(0, 20));
    } catch {
      console.warn("Failed to load benchmark entries from IndexedDB");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Save a benchmark result (meta + full report blob). */
  const saveBenchmark = useCallback(
    async (entry: BenchmarkEntry, reportBlob: Blob) => {
      const db = await openDB();
      await idbPut(txStore(db, META_STORE, "readwrite"), entry);
      await idbPut(txStore(db, BLOB_STORE, "readwrite"), reportBlob, entry.id);
      await refresh();
    },
    [refresh],
  );

  /** Retrieve the full report blob for a given benchmark ID. */
  const getReportBlob = useCallback(
    async (id: string): Promise<Blob | undefined> => {
      const db = await openDB();
      return idbGet<Blob>(txStore(db, BLOB_STORE, "readonly"), id);
    },
    [],
  );

  /** Delete a benchmark entry and its report blob. */
  const deleteBenchmark = useCallback(
    async (id: string) => {
      const db = await openDB();
      await idbDelete(txStore(db, META_STORE, "readwrite"), id);
      await idbDelete(txStore(db, BLOB_STORE, "readwrite"), id);
      await refresh();
    },
    [refresh],
  );

  return { entries, loading, saveBenchmark, getReportBlob, deleteBenchmark };
}
