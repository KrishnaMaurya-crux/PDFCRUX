/**
 * IndexedDB persistence layer for bulk compression sessions.
 * Provides 24-hour auto-cleanup of expired sessions.
 */

const DB_NAME = "pdfcrux-bulk-compress";
const DB_VERSION = 1;
const STORE_NAME = "sessions";

/** 24-hour TTL in milliseconds */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface BulkFileRecord {
  id: string;
  fileName: string;
  fileSize: number;
  fileData: ArrayBuffer;
  status: "pending" | "compressing" | "completed" | "error";
  progress: number;
  compressedSize?: number;
  compressedData?: ArrayBuffer;
  error?: string;
  addedAt: number;
  completedAt?: number;
}

export interface BulkSessionRecord {
  id: string;
  files: BulkFileRecord[];
  compressionLevel: string;
  colorMode: string;
  createdAt: number;
  updatedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);

    request.onerror = () => {
      reject(new Error("Failed to open IndexedDB for bulk compress sessions"));
    };
  });
}

function withStore(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest | void,
): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const result = callback(store);
        if (result) {
          result.onsuccess = () => resolve();
          result.onerror = () =>
            reject(new Error("IndexedDB operation failed"));
        } else {
          tx.oncomplete = () => resolve();
          tx.onerror = () =>
            reject(new Error("IndexedDB transaction failed"));
        }
      }),
  );
}

/**
 * Create a new bulk compression session.
 */
export function createSession(
  files: Omit<BulkFileRecord, "id" | "addedAt">[],
  compressionLevel: string,
  colorMode: string,
): BulkSessionRecord {
  const now = Date.now();
  const session: BulkSessionRecord = {
    id: `bulk-session-${now}`,
    files: files.map((f, i) => ({
      ...f,
      id: `file-${now}-${i}`,
      addedAt: now,
    })),
    compressionLevel,
    colorMode,
    createdAt: now,
    updatedAt: now,
  };
  void saveSession(session);
  return session;
}

/**
 * Save or update a session in IndexedDB.
 */
export async function saveSession(
  session: BulkSessionRecord,
): Promise<void> {
  await withStore("readwrite", (store) => {
    store.put({ ...session, updatedAt: Date.now() });
  });
}

/**
 * Get a session by ID.
 */
export async function getSession(
  id: string,
): Promise<BulkSessionRecord | null> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () =>
          reject(new Error("Failed to get session from IndexedDB"));
      }),
  );
}

/**
 * Get the most recently created session (if any).
 */
export async function getLatestSession(): Promise<BulkSessionRecord | null> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.openCursor(null, "prev");
        request.onsuccess = () => {
          const cursor = request.result;
          resolve(cursor ? (cursor.value as BulkSessionRecord) : null);
        };
        request.onerror = () =>
          reject(new Error("Failed to get latest session from IndexedDB"));
      }),
  );
}

/**
 * Delete a session by ID.
 */
export async function deleteSession(id: string): Promise<void> {
  await withStore("readwrite", (store) => {
    store.delete(id);
  });
}

/**
 * Remove all sessions older than 24 hours.
 */
export async function cleanupExpiredSessions(): Promise<void> {
  const cutoff = Date.now() - SESSION_TTL_MS;

  await openDB().then<void>(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.openCursor();

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            const session = cursor.value as BulkSessionRecord;
            if (session.updatedAt < cutoff) {
              cursor.delete();
            }
            cursor.continue();
          }
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () =>
          reject(new Error("Failed to cleanup expired sessions"));
      }),
  );
}
