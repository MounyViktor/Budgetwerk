// Lokaler Speicher (IndexedDB). Beträge immer in Cent. Nichts verlässt das Gerät.

const DB_NAME = "budgetwerk";
const DB_VERSION = 2;

export type StoreName = "accounts" | "recurring" | "plan" | "bookings" | "meta" | "tasks" | "projects";
export const STORES: StoreName[] = ["accounts", "recurring", "plan", "bookings", "meta", "tasks", "projects"];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = (e) => {
      const db = r.result;
      if (e.oldVersion < 1) {
        db.createObjectStore("accounts", { keyPath: "id", autoIncrement: true });
        db.createObjectStore("recurring", { keyPath: "id", autoIncrement: true });
        db.createObjectStore("plan", { keyPath: "id", autoIncrement: true }).createIndex("month", "month");
        const b = db.createObjectStore("bookings", { keyPath: "id", autoIncrement: true });
        b.createIndex("account_id", "account_id");
        b.createIndex("plan_id", "plan_id");
        db.createObjectStore("meta");
      }
      if (e.oldVersion < 2) {
        db.createObjectStore("tasks", { keyPath: "id", autoIncrement: true }).createIndex("date", "date");
        db.createObjectStore("projects", { keyPath: "id", autoIncrement: true });
      }
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    r.onerror = () => reject(r.error);
  });
  return dbPromise;
}

export function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class Tx {
  constructor(private t: IDBTransaction) {}
  get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> { return req(this.t.objectStore(store).get(key)); }
  all<T>(store: StoreName): Promise<T[]> { return req(this.t.objectStore(store).getAll()); }
  add<T extends object>(store: StoreName, value: T, key?: IDBValidKey): Promise<IDBValidKey> { return req(this.t.objectStore(store).add(value, key)); }
  put<T extends object | string | number | boolean>(store: StoreName, value: T, key?: IDBValidKey): Promise<IDBValidKey> { return req(this.t.objectStore(store).put(value, key)); }
  delete(store: StoreName, key: IDBValidKey): Promise<undefined> { return req(this.t.objectStore(store).delete(key)); }
  clear(store: StoreName): Promise<undefined> { return req(this.t.objectStore(store).clear()); }
  byIndex<T>(store: StoreName, index: string, key: IDBValidKey): Promise<T[]> { return req(this.t.objectStore(store).index(index).getAll(key)); }
  async entries(store: StoreName): Promise<[IDBValidKey, unknown][]> {
    const keys = await req(this.t.objectStore(store).getAllKeys());
    const values = await req(this.t.objectStore(store).getAll());
    return keys.map((k, i) => [k, values[i]]);
  }
}

/** Alles oder nichts: Wirft `fn` einen Fehler, wird die ganze Transaktion verworfen. */
export async function tx<T>(stores: StoreName[], mode: IDBTransactionMode, fn: (t: Tx) => Promise<T>): Promise<T> {
  const db = await openDb();
  const t = db.transaction(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onabort = () => reject(t.error ?? new Error("Speichern abgebrochen."));
    t.onerror = () => reject(t.error);
  });
  let result: T;
  try {
    result = await fn(new Tx(t));
  } catch (e) {
    try { t.abort(); } catch { /* bereits beendet */ }
    await done.catch(() => undefined);
    throw e;
  }
  await done;
  if (mode === "readwrite") notifyChange();
  return result;
}

export const all = <T>(store: StoreName) => tx([store], "readonly", (t) => t.all<T>(store));
export const get = <T>(store: StoreName, key: IDBValidKey) => tx([store], "readonly", (t) => t.get<T>(store, key));

// --- Änderungen melden, damit alle Ansichten neu laden ---

const listeners = new Set<() => void>();
export function onChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function notifyChange() { listeners.forEach((fn) => fn()); }

/** Nur für Tests: Verbindung schließen und Datenbank verwerfen. */
export async function resetForTests() {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}
