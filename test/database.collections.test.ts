/**
 * Persistent service state: serialization, change tracking, and reload
 * (both store backends; see helpers/stores for PostgreSQL)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DomainStore,
  MemoryStore,
  PersistenceRegistry,
  TrackedMap,
  decode,
  encode,
} from "../src/database";
import { storeBackends } from "./helpers/stores";

describe("encode/decode", () => {
  it("round-trips the non-JSON types services store", () => {
    const value = {
      amount: BigInt("123456789012345678901234567890"),
      powers: new Map<string, bigint>([["0xabc", BigInt(5)]]),
      tags: new Set(["a", "b"]),
      when: new Date(1_700_000_000_000),
      file: Buffer.from("report,csv\n1,2"),
      nested: [{ m: new Map([[1, { deep: BigInt(-7) }]]) }],
      plain: { a: 1, b: "two", c: null, d: [true] },
    };

    expect(decode(encode(value))).toEqual(value);
  });

  it("leaves ordinary objects that merely look tagged alone", () => {
    const value = { $bigint: "1", other: true };
    expect(decode(encode(value))).toEqual(value);
  });
});

describe("TrackedMap", () => {
  it("records keys that were read or written", () => {
    const map = new TrackedMap<string, { n: number }>([["a", { n: 1 }]]);
    expect(map.takeTouched()).toBe("all");

    map.get("a")!.n = 2;
    map.set("b", { n: 3 });
    map.delete("c");
    map.has("d");
    expect(map.takeTouched()).toEqual(new Set(["a", "b", "c"]));

    Array.from(map.values());
    expect(map.takeTouched()).toBe("all");
    expect(map.takeTouched()).toEqual(new Set());
  });
});

class Service {
  items: Map<string, { name: string; count: bigint }> = new Map([["seed", { name: "seed", count: BigInt(0) }]]);
  log: string[] = [];
}

for (const backend of storeBackends("collections_test")) {
  describe.skipIf(!backend.enabled)(`PersistenceRegistry (${backend.name} store)`, () => {
    let store: DomainStore;

    beforeEach(async () => {
      store = await backend.open();
    });

    afterEach(async () => {
      await store.close();
    });

    function bound(service: Service): PersistenceRegistry {
      const registry = new PersistenceRegistry();
      registry.bindMap("svc.items", service, "items");
      registry.bindValue("svc.log", service, "log");
      return registry;
    }

    /** A fresh service instance loaded from the store, as after a restart */
    async function restarted(): Promise<Service> {
      const service = new Service();
      service.items.clear();
      await bound(service).hydrate(store);
      return service;
    }

    it("persists additions, in-place changes, deletions and values", async () => {
      const service = new Service();
      const registry = bound(service);

      service.items.set("x", { name: "x", count: BigInt(1) });
      service.log.push("created x");
      await registry.flush(store);

      // Mutate an object obtained through get(), without calling set()
      service.items.get("x")!.count = BigInt(42);
      service.items.delete("seed");
      service.log = [...service.log, "updated x"];
      await registry.flush(store);

      const reloaded = await restarted();
      expect(Array.from(reloaded.items.entries())).toEqual([["x", { name: "x", count: BigInt(42) }]]);
      expect(reloaded.log).toEqual(["created x", "updated x"]);
    });

    it("tracks a Map the service replaced wholesale", async () => {
      const service = new Service();
      const registry = bound(service);
      await registry.flush(store);

      service.items = new Map([["fresh", { name: "fresh", count: BigInt(9) }]]);
      await registry.flush(store);

      const reloaded = await restarted();
      expect(Array.from(reloaded.items.keys())).toEqual(["fresh"]);
    });

    it("keeps seed entries the store does not have and lets stored ones win", async () => {
      const first = new Service();
      const registry = bound(first);
      first.items.get("seed")!.name = "renamed";
      await registry.flush(store);

      const second = new Service(); // constructor seeds { name: "seed" }
      second.items.set("new-seed", { name: "new", count: BigInt(1) });
      const secondRegistry = bound(second);
      await secondRegistry.hydrate(store);

      expect(second.items.get("seed")!.name).toBe("renamed");
      expect(second.items.has("new-seed")).toBe(true);

      // The unseen seed entry is written on the next flush
      await secondRegistry.flush(store);
      expect((await restarted()).items.has("new-seed")).toBe(true);
    });

    it("writes nothing when nothing changed", async () => {
      const service = new Service();
      const registry = bound(service);
      await registry.flush(store);

      let writes = 0;
      const counting = Object.create(store) as DomainStore;
      counting.writeDocuments = async (...args) => {
        writes++;
        return store.writeDocuments(...args);
      };

      service.items.get("seed"); // read only
      Array.from(service.items.values());
      await registry.flush(counting);
      expect(writes).toBe(0);
    });

    it("retries entries whose write failed", async () => {
      const service = new Service();
      const registry = bound(service);
      await registry.flush(store);

      const failing = Object.create(store) as DomainStore;
      failing.writeDocuments = async () => {
        throw new Error("database unavailable");
      };

      service.items.set("y", { name: "y", count: BigInt(2) });
      await expect(registry.flush(failing)).rejects.toThrow("database unavailable");

      await registry.flush(store);
      expect((await restarted()).items.get("y")).toEqual({ name: "y", count: BigInt(2) });
    });
  });
}

describe("PersistenceRegistry bindings", () => {
  it("rejects fields that do not exist or are not Maps", () => {
    const registry = new PersistenceRegistry();
    expect(() => registry.bindMap("a", new Service(), "missing")).toThrow("is not a Map");
    expect(() => registry.bindMap("b", new Service(), "log")).toThrow("is not a Map");
    expect(() => registry.bindValue("c", new Service(), "missing")).toThrow("does not exist");
  });

  it("rejects binding one collection twice", () => {
    const registry = new PersistenceRegistry();
    registry.bindMap("same", new Service(), "items");
    expect(() => registry.bindMap("same", new Service(), "items")).toThrow("already bound");
  });

  it("binds every API service field that is meant to persist", async () => {
    const { registerPersistentState } = await import("../src/api/persistence");
    const { persistence } = await import("../src/database");

    registerPersistentState();
    const collections = persistence.collections();

    for (const expected of [
      "auth.sessions",
      "auth.userRoles",
      "disputes.disputes",
      "disputes.votingPowers",
      "commemoratives.records",
      "social.activities",
      "notifications.webhooks",
      "payments.stripe.sessionIndex",
      "settlements.settlements",
      "enterprise.organizations",
      "compliance.consentRecords",
      "risk.blocklist",
      "resolution.scheduledDeadlines",
      "jobs.jobs",
    ]) {
      expect(collections).toContain(expected);
    }

    // Everything currently held by those services survives serialization
    await persistence.flush(new MemoryStore());
  });
});
