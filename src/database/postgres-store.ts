/**
 * PostgreSQL Database Adapter
 * Production implementation of the database service using PostgreSQL
 *
 * Requires the `pg` package: npm install pg @types/pg
 */

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
 * PostgreSQL client type (from 'pg' package)
 * Using interface to avoid requiring pg at compile time
 */
interface PgPool {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }>;
  connect(): Promise<PgClient>;
  end(): Promise<void>;
}

interface PgClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }>;
  release(): void;
}

interface PgConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  max?: number;
  min?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/**
 * Base PostgreSQL repository with common CRUD operations
 */
class PgRepository<T extends { id: string; createdAt: number }, F extends QueryOptions = QueryOptions>
  implements Repository<T, F>
{
  protected pool: PgPool;
  protected tableName: string;
  protected columns: string[];

  constructor(pool: PgPool, tableName: string, columns: string[]) {
    this.pool = pool;
    this.tableName = tableName;
    this.columns = columns;
  }

  async findById(id: string): Promise<T | null> {
    const result = await this.pool.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async findAll(filter?: F): Promise<T[]> {
    const { whereClause, values } = this.buildWhereClause(filter);
    const orderBy = this.buildOrderBy(filter);
    const pagination = this.buildPagination(filter);

    const query = `SELECT * FROM ${this.tableName} ${whereClause} ${orderBy} ${pagination}`;
    const result = await this.pool.query(query, values);

    return result.rows.map((row) => this.mapRow(row));
  }

  async create(entity: Omit<T, "id" | "createdAt">): Promise<T> {
    const id = this.generateId();
    const createdAt = Date.now();
    const fullEntity = { ...entity, id, createdAt } as T;

    const columns = Object.keys(fullEntity);
    const values = Object.values(fullEntity);
    const placeholders = columns.map((_, i) => `$${i + 1}`);

    const query = `
      INSERT INTO ${this.tableName} (${columns.map(this.toSnakeCase).join(", ")})
      VALUES (${placeholders.join(", ")})
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return this.mapRow(result.rows[0]);
  }

  async update(id: string, updates: Partial<T>): Promise<T | null> {
    const entries = Object.entries(updates).filter(([key]) => key !== "id");
    if (entries.length === 0) return this.findById(id);

    const setClauses = entries.map(([key], i) => `${this.toSnakeCase(key)} = $${i + 2}`);
    const values = [id, ...entries.map(([, value]) => value)];

    const query = `
      UPDATE ${this.tableName}
      SET ${setClauses.join(", ")}
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return result.rowCount > 0;
  }

  async count(filter?: F): Promise<number> {
    const { whereClause, values } = this.buildWhereClause(filter);
    const query = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const result = await this.pool.query(query, values);
    return parseInt((result.rows[0] as { count: string }).count, 10);
  }

  protected buildWhereClause(_filter?: F): { whereClause: string; values: unknown[] } {
    return { whereClause: "", values: [] };
  }

  protected buildOrderBy(filter?: F): string {
    if (filter?.orderBy) {
      const dir = filter.orderDir === "asc" ? "ASC" : "DESC";
      return `ORDER BY ${this.toSnakeCase(filter.orderBy)} ${dir}`;
    }
    return "ORDER BY created_at DESC";
  }

  protected buildPagination(filter?: F): string {
    const parts: string[] = [];
    if (filter?.limit) parts.push(`LIMIT ${filter.limit}`);
    if (filter?.offset) parts.push(`OFFSET ${filter.offset}`);
    return parts.join(" ");
  }

  protected generateId(): string {
    return `${this.tableName.slice(0, 4)}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  protected toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  protected toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  protected mapRow(row: unknown): T {
    const obj = row as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const camelKey = this.toCamelCase(key);

      // Handle timestamps
      if (key.endsWith("_at") && value instanceof Date) {
        result[camelKey] = value.getTime();
      }
      // Handle BigInt/Numeric columns
      else if (typeof value === "string" && /^\d+$/.test(value) && value.length > 15) {
        result[camelKey] = value; // Keep as string for large numbers
      }
      // Handle JSON columns
      else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        result[camelKey] = value;
      }
      else {
        result[camelKey] = value;
      }
    }

    return result as T;
  }
}

/**
 * Campaign repository with PostgreSQL
 */
class PgCampaignRepository extends PgRepository<CampaignEntity, CampaignFilter> {
  constructor(pool: PgPool) {
    super(pool, "campaigns", [
      "id", "chain_id", "creator_address", "beneficiary_address",
      "subject_name", "beneficiary_name", "category", "description",
      "goal_amount", "funding_deadline", "resolution_deadline", "status",
      "total_pledged", "total_released", "total_refunded",
      "created_at", "activated_at", "resolved_at"
    ]);
  }

  protected buildWhereClause(filter?: CampaignFilter): { whereClause: string; values: unknown[] } {
    if (!filter) return { whereClause: "", values: [] };

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      const placeholders = statuses.map(() => `$${paramIndex++}`);
      conditions.push(`status IN (${placeholders.join(", ")})`);
      values.push(...statuses);
    }

    if (filter.category) {
      conditions.push(`category = $${paramIndex++}`);
      values.push(filter.category);
    }

    if (filter.creatorAddress) {
      conditions.push(`LOWER(creator_address) = LOWER($${paramIndex++})`);
      values.push(filter.creatorAddress);
    }

    if (filter.beneficiaryAddress) {
      conditions.push(`LOWER(beneficiary_address) = LOWER($${paramIndex++})`);
      values.push(filter.beneficiaryAddress);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    return { whereClause, values };
  }
}

/**
 * Pledge repository with PostgreSQL
 */
class PgPledgeRepository extends PgRepository<PledgeEntity, PledgeFilter> {
  constructor(pool: PgPool) {
    super(pool, "pledges", [
      "id", "chain_id", "campaign_id", "pledge_type_id", "backer_address",
      "backer_name", "escrowed_amount", "final_amount", "status",
      "calculation_params", "created_at", "resolved_at"
    ]);
  }

  protected buildWhereClause(filter?: PledgeFilter): { whereClause: string; values: unknown[] } {
    if (!filter) return { whereClause: "", values: [] };

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter.campaignId) {
      conditions.push(`campaign_id = $${paramIndex++}`);
      values.push(filter.campaignId);
    }

    if (filter.backerAddress) {
      conditions.push(`LOWER(backer_address) = LOWER($${paramIndex++})`);
      values.push(filter.backerAddress);
    }

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      const placeholders = statuses.map(() => `$${paramIndex++}`);
      conditions.push(`status IN (${placeholders.join(", ")})`);
      values.push(...statuses);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    return { whereClause, values };
  }

  async findByBacker(backerAddress: string): Promise<PledgeEntity[]> {
    return this.findAll({ backerAddress });
  }

  async findByCampaign(campaignId: string): Promise<PledgeEntity[]> {
    return this.findAll({ campaignId });
  }
}

/**
 * Oracle repository with PostgreSQL
 */
class PgOracleRepository extends PgRepository<OracleEntity> {
  constructor(pool: PgPool) {
    super(pool, "oracles", [
      "id", "name", "description", "oracle_type", "trust_level",
      "active", "endpoint", "auth_config", "query_mapping",
      "response_mapping", "poll_interval", "created_at"
    ]);
  }
}

/**
 * Commemorative repository with PostgreSQL
 */
class PgCommemorativeRepository extends PgRepository<CommemorativeEntity> {
  constructor(pool: PgPool) {
    super(pool, "commemoratives", [
      "id", "pledge_id", "campaign_id", "backer_address", "token_id",
      "template_type", "metadata", "image_uri", "metadata_uri",
      "storage_provider", "minted", "minted_at", "tx_hash", "created_at"
    ]);
  }

  async findByPledgeId(pledgeId: string): Promise<CommemorativeEntity | null> {
    const result = await this.pool.query(
      `SELECT * FROM ${this.tableName} WHERE pledge_id = $1`,
      [pledgeId]
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async findByCampaignId(campaignId: string): Promise<CommemorativeEntity[]> {
    const result = await this.pool.query(
      `SELECT * FROM ${this.tableName} WHERE campaign_id = $1 ORDER BY created_at DESC`,
      [campaignId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async findByBackerAddress(address: string): Promise<CommemorativeEntity[]> {
    const result = await this.pool.query(
      `SELECT * FROM ${this.tableName} WHERE LOWER(backer_address) = LOWER($1) ORDER BY created_at DESC`,
      [address]
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}

/**
 * Resolution job repository with PostgreSQL
 */
class PgResolutionJobRepository extends PgRepository<ResolutionJobEntity> {
  constructor(pool: PgPool) {
    super(pool, "resolution_jobs", [
      "id", "campaign_id", "status", "triggered_by",
      "milestones_verified", "milestones_failed", "pledges_resolved",
      "total_released", "total_refunded", "commemoratives_minted",
      "error_message", "started_at", "completed_at", "created_at"
    ]);
  }

  async findByCampaignId(campaignId: string): Promise<ResolutionJobEntity[]> {
    const result = await this.pool.query(
      `SELECT * FROM ${this.tableName} WHERE campaign_id = $1 ORDER BY created_at DESC`,
      [campaignId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}

/**
 * PostgreSQL database service implementation
 */
export class PostgresDatabaseService implements IDatabaseService {
  private pool: PgPool;

  campaigns: PgCampaignRepository;
  pledges: PgPledgeRepository;
  oracles: PgOracleRepository;
  commemoratives: PgCommemorativeRepository;
  resolutionJobs: PgResolutionJobRepository;

  constructor(pool: PgPool) {
    this.pool = pool;
    this.campaigns = new PgCampaignRepository(pool);
    this.pledges = new PgPledgeRepository(pool);
    this.oracles = new PgOracleRepository(pool);
    this.commemoratives = new PgCommemorativeRepository(pool);
    this.resolutionJobs = new PgResolutionJobRepository(pool);
  }

  async isConnected(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async clear(): Promise<void> {
    // Only for testing - clear all tables
    await this.pool.query("TRUNCATE campaigns, pledges, oracles, commemoratives, resolution_jobs CASCADE");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Create PostgreSQL database service
 *
 * Usage:
 *   import { Pool } from 'pg';
 *   import { createPostgresDatabase } from './postgres-store';
 *
 *   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 *   const db = createPostgresDatabase(pool);
 */
export function createPostgresDatabase(pool: PgPool): PostgresDatabaseService {
  return new PostgresDatabaseService(pool);
}

/**
 * Create PostgreSQL pool from config
 *
 * Note: Requires 'pg' package to be installed
 * This function is a factory that dynamically imports 'pg'
 */
export async function createPostgresPool(config: PgConfig): Promise<PgPool> {
  try {
    // Dynamic import to avoid requiring pg at compile time
    const { Pool } = await import("pg");
    return new Pool(config);
  } catch (error) {
    throw new Error(
      "PostgreSQL support requires the 'pg' package. Install it with: npm install pg"
    );
  }
}
