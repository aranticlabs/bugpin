class FakeEventTarget {
  private listeners = new Map<string, Array<(event?: unknown) => void>>();

  addEventListener(type: string, handler: (event?: unknown) => void) {
    const current = this.listeners.get(type) ?? [];
    current.push(handler);
    this.listeners.set(type, current);
  }

  removeEventListener(type: string, handler: (event?: unknown) => void) {
    const current = this.listeners.get(type);
    if (!current) return;
    this.listeners.set(
      type,
      current.filter((fn) => fn !== handler),
    );
  }

  dispatch(type: string, event?: unknown) {
    const current = this.listeners.get(type) ?? [];
    for (const handler of current) {
      handler(event);
    }
  }
}

class FakeRequest extends FakeEventTarget {
  result: unknown;
  error: unknown;

  succeed(result: unknown) {
    this.result = result;
    this.dispatch('success');
  }

  fail(error: unknown) {
    this.error = error;
    this.dispatch('error');
  }
}

class FakeDOMStringList extends Array<string> {
  contains(value: string) {
    return this.includes(value);
  }
}

class FakeStore {
  name: string;
  keyPath: string;
  records = new Map<string, unknown>();
  indexes = new Map<string, FakeIndex>();

  constructor(name: string, keyPath: string) {
    this.name = name;
    this.keyPath = keyPath;
  }
}

class FakeIndex {
  private store: FakeStore;
  private keyPath: string;

  constructor(store: FakeStore, keyPath: string) {
    this.store = store;
    this.keyPath = keyPath;
  }

  getAll() {
    const request = new FakeRequest();
    queueMicrotask(() => {
      const values = Array.from(this.store.records.values());
      values.sort((a, b) => {
        const left = (a as Record<string, string>)[this.keyPath] || '';
        const right = (b as Record<string, string>)[this.keyPath] || '';
        return left.localeCompare(right);
      });
      request.succeed(values);
    });
    return request;
  }
}

class FakeObjectStore {
  private store: FakeStore;
  private transaction?: FakeTransaction;

  constructor(store: FakeStore, transaction?: FakeTransaction) {
    this.store = store;
    this.transaction = transaction;
  }

  createIndex(name: string, keyPath: string) {
    const index = new FakeIndex(this.store, keyPath);
    this.store.indexes.set(name, index);
    return index;
  }

  index(name: string) {
    const index = this.store.indexes.get(name);
    if (!index) {
      throw new Error(`Missing index ${name}`);
    }
    return index;
  }

  put(value: Record<string, unknown>) {
    const request = new FakeRequest();
    queueMicrotask(() => {
      const key = String(value[this.store.keyPath]);
      this.store.records.set(key, value);
      request.succeed(key);
      this.transaction?.complete();
    });
    return request;
  }

  delete(key: string) {
    const request = new FakeRequest();
    queueMicrotask(() => {
      this.store.records.delete(key);
      request.succeed(undefined);
      this.transaction?.complete();
    });
    return request;
  }

  clear() {
    const request = new FakeRequest();
    queueMicrotask(() => {
      this.store.records.clear();
      request.succeed(undefined);
      this.transaction?.complete();
    });
    return request;
  }

  count() {
    const request = new FakeRequest();
    queueMicrotask(() => {
      request.succeed(this.store.records.size);
    });
    return request;
  }

  getAll() {
    const request = new FakeRequest();
    queueMicrotask(() => {
      request.succeed(Array.from(this.store.records.values()));
    });
    return request;
  }
}

class FakeTransaction extends FakeEventTarget {
  objectStoreNames: FakeDOMStringList;
  private db: FakeDatabase;

  constructor(db: FakeDatabase, storeNames: string[]) {
    super();
    this.db = db;
    this.objectStoreNames = new FakeDOMStringList(...storeNames);
  }

  objectStore(name: string) {
    return new FakeObjectStore(this.db.getStore(name), this);
  }

  complete() {
    this.dispatch('complete');
  }
}

class FakeDatabase extends FakeEventTarget {
  name: string;
  version: number;
  objectStoreNames: FakeDOMStringList;
  private stores = new Map<string, FakeStore>();

  constructor(name: string, version: number) {
    super();
    this.name = name;
    this.version = version;
    this.objectStoreNames = new FakeDOMStringList();
  }

  createObjectStore(name: string, options: { keyPath: string }) {
    const store = new FakeStore(name, options.keyPath);
    this.stores.set(name, store);
    if (!this.objectStoreNames.includes(name)) {
      this.objectStoreNames.push(name);
    }
    return new FakeObjectStore(store);
  }

  transaction(storeName: string) {
    return new FakeTransaction(this, [storeName]);
  }

  getStore(name: string) {
    const store = this.stores.get(name);
    if (!store) {
      throw new Error(`Missing store ${name}`);
    }
    return store;
  }

  // Convenience methods for idb library compatibility
  async get(storeName: string, key: string): Promise<unknown> {
    const store = this.getStore(storeName);
    return store.records.get(key);
  }

  async put(storeName: string, value: Record<string, unknown>): Promise<unknown> {
    const store = this.getStore(storeName);
    const keyValue = String(value[store.keyPath]);
    store.records.set(keyValue, value);
    return keyValue;
  }

  async delete(storeName: string, key: string): Promise<void> {
    const store = this.getStore(storeName);
    store.records.delete(key);
  }

  async clear(storeName: string): Promise<void> {
    const store = this.getStore(storeName);
    store.records.clear();
  }
}

class FakeOpenRequest extends FakeRequest {
  transaction?: FakeTransaction;
}

class FakeIndexedDB {
  private databases = new Map<string, FakeDatabase>();

  open(name: string, version?: number) {
    const request = new FakeOpenRequest();
    queueMicrotask(() => {
      const existing = this.databases.get(name);
      const oldVersion = existing ? existing.version : 0;
      const newVersion = version ?? (existing ? existing.version : 1);
      const db = existing ?? new FakeDatabase(name, newVersion);

      if (!existing) {
        this.databases.set(name, db);
      }

      db.version = newVersion;
      request.result = db;

      if (newVersion > oldVersion) {
        request.transaction = new FakeTransaction(db, Array.from(db.objectStoreNames));
        request.dispatch('upgradeneeded', { oldVersion, newVersion });
      }

      request.succeed(db);
    });

    return request;
  }

  deleteDatabase(name: string) {
    const request = new FakeRequest();
    queueMicrotask(() => {
      this.databases.delete(name);
      request.succeed(undefined);
    });
    return request;
  }
}

class FakeCursor {
  advance() {}
  continue() {}
  continuePrimaryKey() {}
}

export function installFakeIndexedDB() {
  const indexedDB = new FakeIndexedDB();

  globalThis.indexedDB = indexedDB as unknown as IDBFactory;
  globalThis.IDBDatabase = FakeDatabase as unknown as typeof IDBDatabase;
  globalThis.IDBTransaction = FakeTransaction as unknown as typeof IDBTransaction;
  globalThis.IDBObjectStore = FakeObjectStore as unknown as typeof IDBObjectStore;
  globalThis.IDBIndex = FakeIndex as unknown as typeof IDBIndex;
  globalThis.IDBRequest = FakeRequest as unknown as typeof IDBRequest;
  globalThis.IDBCursor = FakeCursor as unknown as typeof IDBCursor;
}
