/**
 * In-memory store for development and tests.
 *
 * Behaves like the PostgreSQL store: objects are copied on the way in and out
 * (so forgetting to save() a change loses it here too), writes are
 * serialized, and a failed transaction leaves no trace. Data is lost when the
 * process exits.
 */

import {
  Attestation,
  Campaign,
  CampaignQuery,
  DomainStore,
  Oracle,
  Page,
  Pledge,
  PledgeQuery,
  StoreSession,
  StoredDocument,
} from "./types";

function copy<T>(value: T): T {
  return structuredClone(value);
}

function page<T>(items: T[], limit?: number, offset = 0): Page<T> {
  return {
    items: limit === undefined ? items.slice(offset) : items.slice(offset, offset + limit),
    total: items.length,
  };
}

/** Newest first, with id as a tiebreaker so paging is stable */
function byNewest<T extends { createdAt: number; id: string }>(a: T, b: T): number {
  return b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

interface Tables {
  campaigns: Map<string, Campaign>;
  pledges: Map<string, Pledge>;
  oracles: Map<string, Oracle>;
  attestations: Map<string, Attestation>;
}

function emptyTables(): Tables {
  return {
    campaigns: new Map(),
    pledges: new Map(),
    oracles: new Map(),
    attestations: new Map(),
  };
}

/**
 * Reads and writes against one set of tables: the committed tables for plain
 * reads, or a transaction's private working copy
 */
class MemorySession implements StoreSession {
  constructor(private tables: Tables) {}

  async getCampaign(id: string): Promise<Campaign | null> {
    const campaign = this.tables.campaigns.get(id);
    return campaign ? copy(campaign) : null;
  }

  async listCampaigns(query: CampaignQuery = {}): Promise<Page<Campaign>> {
    const creator = query.creator?.toLowerCase();
    const matches = Array.from(this.tables.campaigns.values())
      .filter((c) => !query.status || c.status === query.status)
      .filter((c) => !query.visibility || c.visibility === query.visibility)
      .filter((c) => !creator || c.creator.toLowerCase() === creator)
      .sort(byNewest);
    return copy(page(matches, query.limit, query.offset));
  }

  async saveCampaign(campaign: Campaign): Promise<void> {
    this.tables.campaigns.set(campaign.id, copy(campaign));
  }

  async getPledge(id: string): Promise<Pledge | null> {
    const pledge = this.tables.pledges.get(id);
    return pledge ? copy(pledge) : null;
  }

  async listPledges(query: PledgeQuery = {}): Promise<Page<Pledge>> {
    const backer = query.backer?.toLowerCase();
    const matches = Array.from(this.tables.pledges.values())
      .filter((p) => !query.campaignId || p.campaignId === query.campaignId)
      .filter((p) => !backer || p.backer.toLowerCase() === backer)
      .filter((p) => !query.status || p.status === query.status)
      .sort(byNewest);
    return copy(page(matches, query.limit, query.offset));
  }

  async savePledge(pledge: Pledge): Promise<void> {
    this.tables.pledges.set(pledge.id, copy(pledge));
  }

  async getOracle(id: string): Promise<Oracle | null> {
    const oracle = this.tables.oracles.get(id);
    return oracle ? copy(oracle) : null;
  }

  async listOracles(): Promise<Oracle[]> {
    return copy(
      Array.from(this.tables.oracles.values()).sort((a, b) => (a.id < b.id ? -1 : 1))
    );
  }

  async saveOracle(oracle: Oracle): Promise<void> {
    this.tables.oracles.set(oracle.id, copy(oracle));
  }

  async getAttestation(campaignId: string, milestoneId: string): Promise<Attestation | null> {
    const attestation = this.tables.attestations.get(`${campaignId}:${milestoneId}`);
    return attestation ? copy(attestation) : null;
  }

  async insertAttestation(attestation: Attestation): Promise<boolean> {
    const key = `${attestation.campaignId}:${attestation.milestoneId}`;
    if (this.tables.attestations.has(key)) {
      return false;
    }
    this.tables.attestations.set(key, copy(attestation));
    return true;
  }
}

export class MemoryStore implements DomainStore {
  readonly kind = "memory" as const;

  /** Committed data. Replaced wholesale when a transaction commits. */
  private tables: Tables = emptyTables();

  /** collection -> id -> JSON text */
  private documents: Map<string, Map<string, string>> = new Map();

  /** Tail of the write queue; each transaction waits for the previous one */
  private queue: Promise<unknown> = Promise.resolve();

  private committed(): MemorySession {
    return new MemorySession(this.tables);
  }

  getCampaign(id: string) {
    return this.committed().getCampaign(id);
  }

  listCampaigns(query?: CampaignQuery) {
    return this.committed().listCampaigns(query);
  }

  saveCampaign(campaign: Campaign) {
    return this.transaction((tx) => tx.saveCampaign(campaign));
  }

  getPledge(id: string) {
    return this.committed().getPledge(id);
  }

  listPledges(query?: PledgeQuery) {
    return this.committed().listPledges(query);
  }

  savePledge(pledge: Pledge) {
    return this.transaction((tx) => tx.savePledge(pledge));
  }

  getOracle(id: string) {
    return this.committed().getOracle(id);
  }

  listOracles() {
    return this.committed().listOracles();
  }

  saveOracle(oracle: Oracle) {
    return this.transaction((tx) => tx.saveOracle(oracle));
  }

  getAttestation(campaignId: string, milestoneId: string) {
    return this.committed().getAttestation(campaignId, milestoneId);
  }

  insertAttestation(attestation: Attestation) {
    return this.transaction((tx) => tx.insertAttestation(attestation));
  }

  /**
   * Transactions run one at a time against a private copy of the data, which
   * becomes the committed data only if fn succeeds. Plain reads never see
   * uncommitted writes.
   */
  async transaction<T>(fn: (session: StoreSession) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const working = copy(this.tables);
      const result = await fn(new MemorySession(working));
      this.tables = working;
      return result;
    };

    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  async listDocuments(collection: string): Promise<StoredDocument[]> {
    return Array.from(this.documents.get(collection) ?? [], ([id, data]) => ({ id, data }));
  }

  async writeDocuments(collection: string, puts: StoredDocument[], deletes: string[]): Promise<void> {
    let docs = this.documents.get(collection);
    if (!docs) {
      docs = new Map();
      this.documents.set(collection, docs);
    }
    for (const id of deletes) docs.delete(id);
    for (const doc of puts) docs.set(doc.id, doc.data);
  }

  async isConnected(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    // Nothing to release
  }

  /** Remove all data (tests) */
  clear(): void {
    this.tables = emptyTables();
    this.documents.clear();
  }
}
