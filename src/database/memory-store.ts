/**
 * In-Memory Store
 * Development/testing implementation of the database service
 *
 * WARNING: Data is lost on server restart. Use PostgreSQL for production.
 */

import { v4 as uuidv4 } from "uuid";
import {
  IDatabaseService,
  Repository,
  QueryOptions,
  CampaignEntity,
  CampaignFilter,
  PledgeEntity,
  PledgeFilter,
  OracleEntity,
  CommemorativeEntity,
  ResolutionJobEntity,
} from "./types";

/**
 * Generic in-memory repository implementation
 */
class MemoryRepository<T extends { id: string; createdAt: number }, F extends QueryOptions = QueryOptions>
  implements Repository<T, F>
{
  protected store: Map<string, T> = new Map();
  protected idPrefix: string;

  constructor(idPrefix: string = "") {
    this.idPrefix = idPrefix;
  }

  async findById(id: string): Promise<T | null> {
    return this.store.get(id) || null;
  }

  async findAll(filter?: F): Promise<T[]> {
    let results = Array.from(this.store.values());

    // Apply filtering (override in subclasses)
    results = this.applyFilter(results, filter);

    // Apply ordering
    if (filter?.orderBy) {
      const dir = filter.orderDir === "desc" ? -1 : 1;
      results.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[filter.orderBy!];
        const bVal = (b as Record<string, unknown>)[filter.orderBy!];
        if (aVal < bVal) return -1 * dir;
        if (aVal > bVal) return 1 * dir;
        return 0;
      });
    } else {
      // Default: order by createdAt desc
      results.sort((a, b) => b.createdAt - a.createdAt);
    }

    // Apply pagination
    const offset = filter?.offset || 0;
    const limit = filter?.limit || results.length;
    return results.slice(offset, offset + limit);
  }

  async create(entity: Omit<T, "id" | "createdAt">): Promise<T> {
    const id = this.idPrefix ? `${this.idPrefix}_${uuidv4()}` : uuidv4();
    const newEntity = {
      ...entity,
      id,
      createdAt: Date.now(),
    } as T;
    this.store.set(id, newEntity);
    return newEntity;
  }

  async update(id: string, updates: Partial<T>): Promise<T | null> {
    const existing = this.store.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, id }; // Prevent id change
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async count(filter?: F): Promise<number> {
    const results = this.applyFilter(Array.from(this.store.values()), filter);
    return results.length;
  }

  protected applyFilter(results: T[], _filter?: F): T[] {
    return results;
  }

  // For testing
  clear(): void {
    this.store.clear();
  }
}

/**
 * Campaign repository with campaign-specific filtering
 */
class CampaignRepository extends MemoryRepository<CampaignEntity, CampaignFilter> {
  constructor() {
    super("campaign");
  }

  protected applyFilter(results: CampaignEntity[], filter?: CampaignFilter): CampaignEntity[] {
    if (!filter) return results;

    return results.filter((c) => {
      if (filter.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        if (!statuses.includes(c.status)) return false;
      }
      if (filter.category && c.category !== filter.category) return false;
      if (filter.creatorAddress && c.creatorAddress.toLowerCase() !== filter.creatorAddress.toLowerCase())
        return false;
      if (
        filter.beneficiaryAddress &&
        c.beneficiaryAddress.toLowerCase() !== filter.beneficiaryAddress.toLowerCase()
      )
        return false;
      return true;
    });
  }
}

/**
 * Pledge repository with pledge-specific filtering
 */
class PledgeRepository extends MemoryRepository<PledgeEntity, PledgeFilter> {
  constructor() {
    super("pledge");
  }

  protected applyFilter(results: PledgeEntity[], filter?: PledgeFilter): PledgeEntity[] {
    if (!filter) return results;

    return results.filter((p) => {
      if (filter.campaignId && p.campaignId !== filter.campaignId) return false;
      if (filter.backerAddress && p.backerAddress.toLowerCase() !== filter.backerAddress.toLowerCase())
        return false;
      if (filter.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        if (!statuses.includes(p.status)) return false;
      }
      return true;
    });
  }

  async findByBacker(backerAddress: string): Promise<PledgeEntity[]> {
    return this.findAll({ backerAddress });
  }

  async findByCampaign(campaignId: string): Promise<PledgeEntity[]> {
    return this.findAll({ campaignId });
  }
}

/**
 * Oracle repository
 */
class OracleRepository extends MemoryRepository<OracleEntity> {
  constructor() {
    super("oracle");
  }

  protected applyFilter(results: OracleEntity[], filter?: QueryOptions): OracleEntity[] {
    // Add oracle-specific filtering if needed
    return results;
  }
}

/**
 * Commemorative repository
 */
class CommemorativeRepository extends MemoryRepository<CommemorativeEntity> {
  private pledgeIndex: Map<string, string> = new Map();
  private campaignIndex: Map<string, string[]> = new Map();
  private backerIndex: Map<string, string[]> = new Map();

  constructor() {
    super("comm");
  }

  async create(entity: Omit<CommemorativeEntity, "id" | "createdAt">): Promise<CommemorativeEntity> {
    const created = await super.create(entity);

    // Update indexes
    this.pledgeIndex.set(entity.pledgeId, created.id);

    const campaignComms = this.campaignIndex.get(entity.campaignId) || [];
    campaignComms.push(created.id);
    this.campaignIndex.set(entity.campaignId, campaignComms);

    const backerComms = this.backerIndex.get(entity.backerAddress.toLowerCase()) || [];
    backerComms.push(created.id);
    this.backerIndex.set(entity.backerAddress.toLowerCase(), backerComms);

    return created;
  }

  async findByPledgeId(pledgeId: string): Promise<CommemorativeEntity | null> {
    const id = this.pledgeIndex.get(pledgeId);
    return id ? this.findById(id) : null;
  }

  async findByCampaignId(campaignId: string): Promise<CommemorativeEntity[]> {
    const ids = this.campaignIndex.get(campaignId) || [];
    const results: CommemorativeEntity[] = [];
    for (const id of ids) {
      const entity = await this.findById(id);
      if (entity) results.push(entity);
    }
    return results;
  }

  async findByBackerAddress(address: string): Promise<CommemorativeEntity[]> {
    const ids = this.backerIndex.get(address.toLowerCase()) || [];
    const results: CommemorativeEntity[] = [];
    for (const id of ids) {
      const entity = await this.findById(id);
      if (entity) results.push(entity);
    }
    return results;
  }

  clear(): void {
    super.clear();
    this.pledgeIndex.clear();
    this.campaignIndex.clear();
    this.backerIndex.clear();
  }
}

/**
 * Resolution job repository
 */
class ResolutionJobRepository extends MemoryRepository<ResolutionJobEntity> {
  constructor() {
    super("res");
  }

  async findByCampaignId(campaignId: string): Promise<ResolutionJobEntity[]> {
    const all = await this.findAll();
    return all.filter((j) => j.campaignId === campaignId);
  }
}

/**
 * In-memory database service implementation
 */
export class MemoryDatabaseService implements IDatabaseService {
  campaigns: CampaignRepository;
  pledges: PledgeRepository;
  oracles: OracleRepository;
  commemoratives: CommemorativeRepository;
  resolutionJobs: ResolutionJobRepository;

  constructor() {
    this.campaigns = new CampaignRepository();
    this.pledges = new PledgeRepository();
    this.oracles = new OracleRepository();
    this.commemoratives = new CommemorativeRepository();
    this.resolutionJobs = new ResolutionJobRepository();
  }

  async isConnected(): Promise<boolean> {
    return true; // Always connected for in-memory
  }

  async clear(): Promise<void> {
    this.campaigns.clear();
    this.pledges.clear();
    this.oracles.clear();
    this.commemoratives.clear();
    this.resolutionJobs.clear();
  }
}

// Singleton instance
export const memoryDatabase = new MemoryDatabaseService();
