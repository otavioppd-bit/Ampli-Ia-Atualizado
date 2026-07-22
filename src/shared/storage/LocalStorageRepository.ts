import { StorageRepository } from './StorageRepository';

interface StoredItem {
  id: string;
  [key: string]: unknown;
}

export class LocalStorageRepository<T extends StoredItem> implements StorageRepository<T> {
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  private getKey(id: string): string {
    return `${this.prefix}_${id}`;
  }

  private getAllKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }

  get(id: string): T | null {
    try {
      const raw = localStorage.getItem(this.getKey(id));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  set(id: string, data: T): void {
    localStorage.setItem(this.getKey(id), JSON.stringify(data));
  }

  list(): T[] {
    try {
      return this.getAllKeys()
        .map(key => {
          const raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw) as T : null;
        })
        .filter((item): item is T => item !== null);
    } catch {
      return [];
    }
  }

  push(data: T): void {
    const id = data.id || `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const item = { ...data, id, timestamp: data.timestamp || Date.now() } as T;
    this.set(id, item);
  }

  delete(id: string): void {
    localStorage.removeItem(this.getKey(id));
  }
}
