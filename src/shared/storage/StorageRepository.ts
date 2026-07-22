export interface StorageRepository<T> {
  get(id: string): T | null;
  set(id: string, data: T): void;
  list(): T[];
  push(data: T): void;
  delete(id: string): void;
}
