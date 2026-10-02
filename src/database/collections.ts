/**
 * Persistent service state.
 *
 * Most services keep their state in Maps (and a few arrays) on singleton
 * instances. Rather than rewriting each one around async storage calls, their
 * fields are bound here to document collections in the store:
 *
 *  - hydrate() loads every bound collection at startup, before the server
 *    accepts requests
 *  - flush() writes whatever changed since the last flush. The API calls it
 *    before answering any request that may have changed state (see
 *    persistBeforeResponse), so a success response means the change is
 *    stored; the server also flushes periodically and on shutdown for
 *    changes made by background work
 *
 * Bound Maps are replaced by a TrackedMap that records which keys were read or
 * written, so a flush only re-serializes entries that may have changed. Each
 * entry is its own document; other fields (arrays, objects) are stored as one
 * document.
 *
 * The in-memory copy is authoritative while the process runs, so this suits a
 * single API instance. Campaigns, pledges, oracles and attestations live in
 * dedicated tables with row locking and are safe across instances.
 */

import { DomainStore, StoredDocument } from "./types";

// ============================================================================
// SERIALIZATION
// ============================================================================

/**
 * JSON with tagged encodings for the non-JSON types services store
 */
export function encode(value: unknown): string {
  return JSON.stringify(value, function (key, raw) {
    // `this[key]` is the value before toJSON (Dates and Buffers define one)
    const original = (this as Record<string, unknown>)[key];
    if (typeof original === "bigint") return { $bigint: original.toString() };
    if (original instanceof Map) return { $map: Array.from(original.entries()) };
    if (original instanceof Set) return { $set: Array.from(original.values()) };
    if (original instanceof Date) return { $date: original.getTime() };
    if (Buffer.isBuffer(original)) return { $buffer: original.toString("base64") };
    return raw;
  });
}

export function decode(text: string): unknown {
  return JSON.parse(text, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length === 1) {
        switch (keys[0]) {
          case "$bigint":
            return BigInt(value.$bigint);
          case "$map":
            return new Map(value.$map);
          case "$set":
            return new Set(value.$set);
          case "$date":
            return new Date(value.$date);
          case "$buffer":
            return Buffer.from(value.$buffer, "base64");
        }
      }
    }
    return value;
  });
}

// ============================================================================
// TRACKED MAP
// ============================================================================

/**
 * A Map that remembers which keys may have changed. Reading a value counts,
 * because callers mutate the objects they get; iterating marks everything.
 */
export class TrackedMap<K, V> extends Map<K, V> {
  private touchedKeys: Set<K> | "all" = "all";

  private touch(key: K): void {
    // Runs during super() for constructor entries, before touchedKeys is
    // initialized; the initializer then marks everything anyway
    if (this.touchedKeys instanceof Set) {
      this.touchedKeys.add(key);
    }
  }

  touchAll(): void {
    this.touchedKeys = "all";
  }

  /** Keys touched since the last call ("all" means every key) */
  takeTouched(): Set<K> | "all" {
    const touched = this.touchedKeys;
    this.touchedKeys = new Set();
    return touched;
  }

  /** Read without marking the key as touched */
  peek(key: K): V | undefined {
    return super.get(key);
  }

  override get(key: K): V | undefined {
    this.touch(key);
    return super.get(key);
  }

  override set(key: K, value: V): this {
    this.touch(key);
    return super.set(key, value);
  }

  override delete(key: K): boolean {
    this.touch(key);
    return super.delete(key);
  }

  override clear(): void {
    this.touchAll();
    super.clear();
  }

  override forEach(callback: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void {
    this.touchAll();
    super.forEach(callback, thisArg);
  }

  override entries(): MapIterator<[K, V]> {
    this.touchAll();
    return super.entries();
  }

  override values(): MapIterator<V> {
    this.touchAll();
    return super.values();
  }

  override keys(): MapIterator<K> {
    // Keys alone cannot be mutated through, but deletions show up as missing keys
    return super.keys();
  }

  override [Symbol.iterator](): MapIterator<[K, V]> {
    this.touchAll();
    return super[Symbol.iterator]();
  }

  /** Iterate without marking anything as touched */
  *peekEntries(): IterableIterator<[K, V]> {
    yield* super.entries();
  }
}

// ============================================================================
// REGISTRY
// ============================================================================

interface Binding {
  collection: string;
  kind: "map" | "value";
  owner: Record<string, unknown>;
  field: string;
  /** Document ID -> JSON last written (or loaded) */
  persisted: Map<string, string>;
}

/** Document ID of the single document a value binding is stored as */
const VALUE_ID = "value";

export class PersistenceRegistry {
  private bindings = new Map<string, Binding>();
  /** Flushes run one at a time */
  private queue: Promise<unknown> = Promise.resolve();

  /**
   * Persist a Map field of `owner` as one document per entry
   */
  bindMap(collection: string, owner: object, field: string): void {
    const value = (owner as Record<string, unknown>)[field];
    if (!(value instanceof Map)) {
      throw new Error(`Cannot persist ${collection}: field "${field}" is not a Map`);
    }
    this.register(collection, owner, field, "map");
    this.ensureTracked(this.bindings.get(collection)!);
  }

  /**
   * Persist any other field (array, object) as a single document
   */
  bindValue(collection: string, owner: object, field: string): void {
    if (!(field in owner)) {
      throw new Error(`Cannot persist ${collection}: field "${field}" does not exist`);
    }
    this.register(collection, owner, field, "value");
  }

  collections(): string[] {
    return Array.from(this.bindings.keys());
  }

  private register(collection: string, owner: object, field: string, kind: Binding["kind"]): void {
    if (this.bindings.has(collection)) {
      throw new Error(`Collection "${collection}" is already bound`);
    }
    this.bindings.set(collection, {
      collection,
      kind,
      owner: owner as Record<string, unknown>,
      field,
      persisted: new Map(),
    });
  }

  /** The bound Map, wrapped in a TrackedMap if code replaced it */
  private ensureTracked(binding: Binding): TrackedMap<unknown, unknown> {
    const current = binding.owner[binding.field] as Map<unknown, unknown>;
    if (current instanceof TrackedMap) {
      return current;
    }
    const tracked = new TrackedMap(current);
    tracked.touchAll();
    binding.owner[binding.field] = tracked;
    return tracked;
  }

  /**
   * Load every bound collection from the store. Stored entries replace
   * same-key entries the service created at construction (seed data); seed
   * entries that were never stored are kept and written on the next flush.
   */
  async hydrate(store: DomainStore): Promise<void> {
    await this.enqueue(async () => {
      for (const binding of this.bindings.values()) {
        const docs = await store.listDocuments(binding.collection);
        binding.persisted.clear();

        if (binding.kind === "map") {
          const map = this.ensureTracked(binding);
          for (const doc of docs) {
            map.set(decode(doc.id), decode(doc.data));
            // Store the re-encoded form: the database may normalize JSON text
            binding.persisted.set(doc.id, encode(decode(doc.data)));
          }
          map.touchAll();
        } else {
          const doc = docs.find((d) => d.id === VALUE_ID);
          if (doc) {
            binding.owner[binding.field] = decode(doc.data);
            binding.persisted.set(VALUE_ID, encode(binding.owner[binding.field]));
          }
        }
      }
    });
  }

  /**
   * Write everything that changed since the last flush
   */
  async flush(store: DomainStore): Promise<void> {
    await this.enqueue(async () => {
      for (const binding of this.bindings.values()) {
        if (binding.kind === "map") {
          await this.flushMap(store, binding);
        } else {
          await this.flushValue(store, binding);
        }
      }
    });
  }

  private async flushMap(store: DomainStore, binding: Binding): Promise<void> {
    const map = this.ensureTracked(binding);
    const touched = map.takeTouched();

    let ids: Iterable<[string, unknown]>;
    if (touched === "all") {
      // Every current key, plus stored keys that may have been deleted
      const all = new Map<string, unknown>();
      for (const [key] of map.peekEntries()) all.set(encode(key), key);
      for (const id of binding.persisted.keys()) if (!all.has(id)) all.set(id, decode(id));
      ids = all;
    } else {
      ids = Array.from(touched, (key) => [encode(key), key] as [string, unknown]);
    }

    const puts: StoredDocument[] = [];
    const deletes: string[] = [];
    for (const [id, key] of ids) {
      if (map.has(key)) {
        const data = encode(map.peek(key));
        if (binding.persisted.get(id) !== data) puts.push({ id, data });
      } else if (binding.persisted.has(id)) {
        deletes.push(id);
      }
    }

    if (puts.length === 0 && deletes.length === 0) return;

    try {
      await store.writeDocuments(binding.collection, puts, deletes);
    } catch (error) {
      // Retry these entries on the next flush
      map.touchAll();
      throw error;
    }
    for (const doc of puts) binding.persisted.set(doc.id, doc.data);
    for (const id of deletes) binding.persisted.delete(id);
  }

  private async flushValue(store: DomainStore, binding: Binding): Promise<void> {
    const data = encode(binding.owner[binding.field]);
    if (binding.persisted.get(VALUE_ID) === data) return;
    await store.writeDocuments(binding.collection, [{ id: VALUE_ID, data }], []);
    binding.persisted.set(VALUE_ID, data);
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work, work);
    this.queue = result.catch(() => undefined);
    return result;
  }
}

/** The process-wide registry used by the API */
export const persistence = new PersistenceRegistry();
