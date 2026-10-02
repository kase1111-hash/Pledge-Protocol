/**
 * PostgreSQL store.
 *
 * Each entity is a JSONB document plus the scalar columns used for filtering
 * and ordering. The schema is created (idempotently) by migrate(), which
 * createPostgresStore() runs before returning.
 */

import { Pool, PoolClient, PoolConfig } from "pg";
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

/**
 * Versioned migrations, applied in order. Never edit a released entry; append
 * a new one instead.
 */
export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE campaign_records (
        id          TEXT PRIMARY KEY,
        creator     TEXT NOT NULL,
        status      TEXT NOT NULL,
        visibility  TEXT NOT NULL,
        created_at  BIGINT NOT NULL,
        data        JSONB NOT NULL
      );
      CREATE INDEX campaign_records_status_idx ON campaign_records (status);
      CREATE INDEX campaign_records_creator_idx ON campaign_records (creator);
      CREATE INDEX campaign_records_created_idx ON campaign_records (created_at DESC, id);

      CREATE TABLE pledge_records (
        id           TEXT PRIMARY KEY,
        campaign_id  TEXT NOT NULL REFERENCES campaign_records (id),
        backer       TEXT NOT NULL,
        status       TEXT NOT NULL,
        created_at   BIGINT NOT NULL,
        data         JSONB NOT NULL
      );
      CREATE INDEX pledge_records_campaign_idx ON pledge_records (campaign_id);
      CREATE INDEX pledge_records_backer_idx ON pledge_records (backer);
      CREATE INDEX pledge_records_created_idx ON pledge_records (created_at DESC, id);

      CREATE TABLE oracle_records (
        id    TEXT PRIMARY KEY,
        data  JSONB NOT NULL
      );

      CREATE TABLE attestation_records (
        campaign_id   TEXT NOT NULL,
        milestone_id  TEXT NOT NULL,
        oracle_id     TEXT NOT NULL,
        data          JSONB NOT NULL,
        PRIMARY KEY (campaign_id, milestone_id)
      );
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE document_records (
        collection  TEXT NOT NULL,
        id          TEXT NOT NULL,
        data        JSONB NOT NULL,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (collection, id)
      );
    `,
  },
];

interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

function addFilter(where: string[], values: unknown[], column: string, value: unknown): void {
  if (value === undefined) return;
  values.push(value);
  where.push(`${column} = $${values.length}`);
}

function whereClause(where: string[]): string {
  return where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
}

function pagination(values: unknown[], limit?: number, offset?: number): string {
  let sql = "";
  if (limit !== undefined) {
    values.push(limit);
    sql += ` LIMIT $${values.length}`;
  }
  if (offset) {
    values.push(offset);
    sql += ` OFFSET $${values.length}`;
  }
  return sql;
}

/**
 * Queries bound to either the pool or a single transaction's client
 */
class PostgresSession implements StoreSession {
  constructor(protected db: Queryable) {}

  async getCampaign(id: string, options?: { forUpdate?: boolean }): Promise<Campaign | null> {
    const lock = options?.forUpdate ? " FOR UPDATE" : "";
    const result = await this.db.query(`SELECT data FROM campaign_records WHERE id = $1${lock}`, [id]);
    return (result.rows[0]?.data as Campaign) ?? null;
  }

  async listCampaigns(query: CampaignQuery = {}): Promise<Page<Campaign>> {
    const where: string[] = [];
    const values: unknown[] = [];
    addFilter(where, values, "status", query.status);
    addFilter(where, values, "visibility", query.visibility);
    addFilter(where, values, "creator", query.creator?.toLowerCase());

    const count = await this.db.query(
      `SELECT COUNT(*)::int AS total FROM campaign_records ${whereClause(where)}`,
      values
    );
    const pageValues = [...values];
    const rows = await this.db.query(
      `SELECT data FROM campaign_records ${whereClause(where)} ORDER BY created_at DESC, id` +
        pagination(pageValues, query.limit, query.offset),
      pageValues
    );
    return {
      items: rows.rows.map((r) => r.data as Campaign),
      total: count.rows[0].total as number,
    };
  }

  async saveCampaign(campaign: Campaign): Promise<void> {
    await this.db.query(
      `INSERT INTO campaign_records (id, creator, status, visibility, created_at, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         creator = EXCLUDED.creator,
         status = EXCLUDED.status,
         visibility = EXCLUDED.visibility,
         data = EXCLUDED.data`,
      [
        campaign.id,
        campaign.creator.toLowerCase(),
        campaign.status,
        campaign.visibility,
        campaign.createdAt,
        JSON.stringify(campaign),
      ]
    );
  }

  async getPledge(id: string, options?: { forUpdate?: boolean }): Promise<Pledge | null> {
    const lock = options?.forUpdate ? " FOR UPDATE" : "";
    const result = await this.db.query(`SELECT data FROM pledge_records WHERE id = $1${lock}`, [id]);
    return (result.rows[0]?.data as Pledge) ?? null;
  }

  async listPledges(query: PledgeQuery = {}): Promise<Page<Pledge>> {
    const where: string[] = [];
    const values: unknown[] = [];
    addFilter(where, values, "campaign_id", query.campaignId);
    addFilter(where, values, "backer", query.backer?.toLowerCase());
    addFilter(where, values, "status", query.status);

    const count = await this.db.query(
      `SELECT COUNT(*)::int AS total FROM pledge_records ${whereClause(where)}`,
      values
    );
    const pageValues = [...values];
    const rows = await this.db.query(
      `SELECT data FROM pledge_records ${whereClause(where)} ORDER BY created_at DESC, id` +
        pagination(pageValues, query.limit, query.offset),
      pageValues
    );
    return {
      items: rows.rows.map((r) => r.data as Pledge),
      total: count.rows[0].total as number,
    };
  }

  async savePledge(pledge: Pledge): Promise<void> {
    await this.db.query(
      `INSERT INTO pledge_records (id, campaign_id, backer, status, created_at, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         data = EXCLUDED.data`,
      [
        pledge.id,
        pledge.campaignId,
        pledge.backer.toLowerCase(),
        pledge.status,
        pledge.createdAt,
        JSON.stringify(pledge),
      ]
    );
  }

  async getOracle(id: string): Promise<Oracle | null> {
    const result = await this.db.query(`SELECT data FROM oracle_records WHERE id = $1`, [id]);
    return (result.rows[0]?.data as Oracle) ?? null;
  }

  async listOracles(): Promise<Oracle[]> {
    const result = await this.db.query(`SELECT data FROM oracle_records ORDER BY id`);
    return result.rows.map((r) => r.data as Oracle);
  }

  async saveOracle(oracle: Oracle): Promise<void> {
    await this.db.query(
      `INSERT INTO oracle_records (id, data) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [oracle.id, JSON.stringify(oracle)]
    );
  }

  async getAttestation(campaignId: string, milestoneId: string): Promise<Attestation | null> {
    const result = await this.db.query(
      `SELECT data FROM attestation_records WHERE campaign_id = $1 AND milestone_id = $2`,
      [campaignId, milestoneId]
    );
    return (result.rows[0]?.data as Attestation) ?? null;
  }

  async insertAttestation(attestation: Attestation): Promise<boolean> {
    const result = await this.db.query(
      `INSERT INTO attestation_records (campaign_id, milestone_id, oracle_id, data)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (campaign_id, milestone_id) DO NOTHING`,
      [attestation.campaignId, attestation.milestoneId, attestation.oracleId, JSON.stringify(attestation)]
    );
    return result.rowCount === 1;
  }
}

export class PostgresStore extends PostgresSession implements DomainStore {
  readonly kind = "postgresql" as const;

  constructor(private pool: Pool) {
    super(pool as unknown as Queryable);
  }

  async transaction<T>(fn: (session: StoreSession) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(new PostgresSession(client as unknown as Queryable));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listDocuments(collection: string): Promise<StoredDocument[]> {
    const result = await this.pool.query(
      `SELECT id, data::text AS data FROM document_records WHERE collection = $1`,
      [collection]
    );
    return result.rows.map((r) => ({ id: r.id as string, data: r.data as string }));
  }

  async writeDocuments(collection: string, puts: StoredDocument[], deletes: string[]): Promise<void> {
    if (puts.length === 0 && deletes.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (deletes.length > 0) {
        await client.query(
          `DELETE FROM document_records WHERE collection = $1 AND id = ANY($2::text[])`,
          [collection, deletes]
        );
      }
      // Batched upsert: one statement per chunk keeps large flushes fast
      for (let i = 0; i < puts.length; i += 500) {
        const chunk = puts.slice(i, i + 500);
        const values: unknown[] = [collection];
        const rows = chunk.map((doc) => {
          values.push(doc.id, doc.data);
          return `($1, $${values.length - 1}, $${values.length}::jsonb, NOW())`;
        });
        await client.query(
          `INSERT INTO document_records (collection, id, data, updated_at) VALUES ${rows.join(", ")}
           ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
          values
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Apply any migrations not yet recorded in schema_migrations. A session-level
   * advisory lock keeps concurrently starting instances from racing.
   */
  async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(727001)");
      await client.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
           version     INTEGER PRIMARY KEY,
           applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
         )`
      );
      const applied = await client.query("SELECT version FROM schema_migrations");
      const done = new Set(applied.rows.map((r) => r.version as number));

      for (const migration of MIGRATIONS) {
        if (done.has(migration.version)) continue;
        await client.query("BEGIN");
        try {
          await client.query(migration.sql);
          await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [migration.version]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(727001)").catch(() => undefined);
      client.release();
    }
  }

  async isConnected(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Connect, verify the connection, and bring the schema up to date
 */
export async function createPostgresStore(config: PoolConfig): Promise<PostgresStore> {
  const pool = new Pool(config);
  const store = new PostgresStore(pool);
  try {
    await store.migrate();
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
  return store;
}
