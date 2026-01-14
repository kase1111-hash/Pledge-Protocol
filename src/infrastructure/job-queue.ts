/**
 * Background Job Queue
 * Phase 7: Production Infrastructure - Async job processing with retry and prioritization
 */

import { randomBytes } from "crypto";
import { logger, auditLogger } from "../security/audit-logger";

/**
 * Job status
 */
export type JobStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

/**
 * Job priority levels
 */
export type JobPriority = "low" | "normal" | "high" | "critical";

const PRIORITY_VALUES: Record<JobPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
};

/**
 * Job definition
 */
export interface Job<T = any> {
  id: string;
  type: string;
  data: T;
  status: JobStatus;
  priority: JobPriority;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  scheduledAt: number;
  startedAt?: number;
  completedAt?: number;
  failedAt?: number;
  error?: string;
  result?: any;
  metadata?: Record<string, any>;
}

/**
 * Job handler function
 */
export type JobHandler<T = any, R = any> = (job: Job<T>) => Promise<R>;

/**
 * Job queue options
 */
export interface JobQueueOptions {
  maxConcurrent?: number;
  pollIntervalMs?: number;
  defaultMaxAttempts?: number;
  retryDelayMs?: number;
  retryBackoffMultiplier?: number;
  onJobComplete?: (job: Job) => void;
  onJobFailed?: (job: Job, error: Error) => void;
}

/**
 * Job Queue
 * In-memory job queue for background processing
 * For production, replace with Bull + Redis
 */
export class JobQueue {
  private jobs: Map<string, Job> = new Map();
  private handlers: Map<string, JobHandler> = new Map();
  private processing: Set<string> = new Set();
  private running: boolean = false;
  private pollInterval?: NodeJS.Timeout;

  private readonly maxConcurrent: number;
  private readonly pollIntervalMs: number;
  private readonly defaultMaxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly retryBackoffMultiplier: number;
  private readonly onJobComplete?: (job: Job) => void;
  private readonly onJobFailed?: (job: Job, error: Error) => void;

  constructor(options?: JobQueueOptions) {
    this.maxConcurrent = options?.maxConcurrent || 5;
    this.pollIntervalMs = options?.pollIntervalMs || 1000;
    this.defaultMaxAttempts = options?.defaultMaxAttempts || 3;
    this.retryDelayMs = options?.retryDelayMs || 5000;
    this.retryBackoffMultiplier = options?.retryBackoffMultiplier || 2;
    this.onJobComplete = options?.onJobComplete;
    this.onJobFailed = options?.onJobFailed;
  }

  /**
   * Register a job handler
   */
  registerHandler<T = any, R = any>(type: string, handler: JobHandler<T, R>): void {
    this.handlers.set(type, handler);
    logger.info(`Registered job handler: ${type}`);
  }

  /**
   * Add a job to the queue
   */
  addJob<T = any>(
    type: string,
    data: T,
    options?: {
      priority?: JobPriority;
      maxAttempts?: number;
      delay?: number;
      metadata?: Record<string, any>;
    }
  ): Job<T> {
    const now = Date.now();
    const job: Job<T> = {
      id: `job-${randomBytes(8).toString("hex")}`,
      type,
      data,
      status: "pending",
      priority: options?.priority || "normal",
      attempts: 0,
      maxAttempts: options?.maxAttempts || this.defaultMaxAttempts,
      createdAt: now,
      scheduledAt: now + (options?.delay || 0),
      metadata: options?.metadata,
    };

    this.jobs.set(job.id, job);

    logger.debug(`Job added: ${job.id}`, { type: job.type, priority: job.priority });

    return job;
  }

  /**
   * Add multiple jobs in bulk
   */
  addBulk<T = any>(
    jobs: Array<{
      type: string;
      data: T;
      priority?: JobPriority;
    }>
  ): Job<T>[] {
    return jobs.map((j) => this.addJob(j.type, j.data, { priority: j.priority }));
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === "processing") {
      return false; // Can't cancel processing jobs
    }

    job.status = "cancelled";
    logger.info(`Job cancelled: ${jobId}`);

    return true;
  }

  /**
   * Retry a failed job
   */
  retryJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "failed") {
      return false;
    }

    job.status = "pending";
    job.attempts = 0;
    job.scheduledAt = Date.now();
    job.error = undefined;
    job.failedAt = undefined;

    logger.info(`Job retry scheduled: ${jobId}`);

    return true;
  }

  /**
   * Start processing jobs
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.pollInterval = setInterval(() => this.processQueue(), this.pollIntervalMs);

    logger.info("Job queue started");
  }

  /**
   * Stop processing jobs
   */
  stop(): void {
    this.running = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }

    logger.info("Job queue stopped");
  }

  /**
   * Process pending jobs
   */
  private async processQueue(): Promise<void> {
    if (this.processing.size >= this.maxConcurrent) {
      return; // At capacity
    }

    const pendingJobs = this.getPendingJobs();
    const availableSlots = this.maxConcurrent - this.processing.size;

    for (let i = 0; i < Math.min(pendingJobs.length, availableSlots); i++) {
      const job = pendingJobs[i];
      this.processJob(job);
    }
  }

  /**
   * Get pending jobs sorted by priority and scheduled time
   */
  private getPendingJobs(): Job[] {
    const now = Date.now();

    return Array.from(this.jobs.values())
      .filter((j) => j.status === "pending" && j.scheduledAt <= now)
      .sort((a, b) => {
        // Sort by priority (higher first), then by scheduled time (earlier first)
        const priorityDiff = PRIORITY_VALUES[b.priority] - PRIORITY_VALUES[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.scheduledAt - b.scheduledAt;
      });
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job): Promise<void> {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      logger.warn(`No handler for job type: ${job.type}`);
      job.status = "failed";
      job.error = `No handler registered for type: ${job.type}`;
      job.failedAt = Date.now();
      return;
    }

    this.processing.add(job.id);
    job.status = "processing";
    job.startedAt = Date.now();
    job.attempts++;

    logger.debug(`Processing job: ${job.id}`, {
      type: job.type,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts,
    });

    try {
      const result = await handler(job);

      job.status = "completed";
      job.completedAt = Date.now();
      job.result = result;

      logger.info(`Job completed: ${job.id}`, {
        type: job.type,
        duration: job.completedAt - (job.startedAt || 0),
      });

      auditLogger.success(
        "job_completed",
        { type: "system" },
        { type: "job", id: job.id },
        { type: job.type, attempts: job.attempts }
      );

      if (this.onJobComplete) {
        this.onJobComplete(job);
      }
    } catch (error) {
      const err = error as Error;

      logger.error(`Job failed: ${job.id}`, err, {
        type: job.type,
        attempt: job.attempts,
      });

      if (job.attempts < job.maxAttempts) {
        // Schedule retry with exponential backoff
        const delay =
          this.retryDelayMs * Math.pow(this.retryBackoffMultiplier, job.attempts - 1);
        job.status = "pending";
        job.scheduledAt = Date.now() + delay;

        logger.info(`Job scheduled for retry: ${job.id}`, {
          nextAttemptIn: delay,
          attemptsRemaining: job.maxAttempts - job.attempts,
        });
      } else {
        job.status = "failed";
        job.error = err.message;
        job.failedAt = Date.now();

        auditLogger.failure(
          "job_failed",
          { type: "system" },
          { type: "job", id: job.id },
          { type: job.type, attempts: job.attempts },
          err.message
        );

        if (this.onJobFailed) {
          this.onJobFailed(job, err);
        }
      }
    } finally {
      this.processing.delete(job.id);
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
    byType: Record<string, number>;
    byPriority: Record<JobPriority, number>;
  } {
    const stats = {
      total: this.jobs.size,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      byType: {} as Record<string, number>,
      byPriority: {
        low: 0,
        normal: 0,
        high: 0,
        critical: 0,
      },
    };

    for (const job of this.jobs.values()) {
      stats[job.status]++;
      stats.byType[job.type] = (stats.byType[job.type] || 0) + 1;
      stats.byPriority[job.priority]++;
    }

    return stats;
  }

  /**
   * List jobs with filters
   */
  listJobs(options?: {
    type?: string;
    status?: JobStatus;
    priority?: JobPriority;
    limit?: number;
  }): Job[] {
    let jobs = Array.from(this.jobs.values());

    if (options?.type) {
      jobs = jobs.filter((j) => j.type === options.type);
    }

    if (options?.status) {
      jobs = jobs.filter((j) => j.status === options.status);
    }

    if (options?.priority) {
      jobs = jobs.filter((j) => j.priority === options.priority);
    }

    // Sort by created time descending
    jobs.sort((a, b) => b.createdAt - a.createdAt);

    if (options?.limit) {
      jobs = jobs.slice(0, options.limit);
    }

    return jobs;
  }

  /**
   * Clean up completed/failed jobs older than retention period
   */
  cleanup(retentionMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - retentionMs;
    let cleaned = 0;

    for (const [id, job] of this.jobs.entries()) {
      if (
        (job.status === "completed" || job.status === "failed" || job.status === "cancelled") &&
        (job.completedAt || job.failedAt || job.createdAt) < cutoff
      ) {
        this.jobs.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} old jobs`);
    }

    return cleaned;
  }

  /**
   * Clear all jobs
   */
  clear(): void {
    this.jobs.clear();
    logger.info("Job queue cleared");
  }

  /**
   * Wait for a job to complete
   */
  async waitForJob(jobId: string, timeoutMs: number = 30000): Promise<Job> {
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const check = () => {
        const job = this.jobs.get(jobId);

        if (!job) {
          reject(new Error(`Job not found: ${jobId}`));
          return;
        }

        if (job.status === "completed" || job.status === "failed") {
          resolve(job);
          return;
        }

        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for job: ${jobId}`));
          return;
        }

        setTimeout(check, 100);
      };

      check();
    });
  }
}

// ============================================================================
// PRE-DEFINED JOB TYPES
// ============================================================================

/**
 * Job types for the pledge protocol
 */
export const JOB_TYPES = {
  // Oracle jobs
  ORACLE_QUERY: "oracle:query",
  ORACLE_AGGREGATE: "oracle:aggregate",

  // Pledge jobs
  PLEDGE_RELEASE: "pledge:release",
  PLEDGE_REFUND: "pledge:refund",
  PLEDGE_CALCULATE: "pledge:calculate",

  // Commemorative jobs
  COMMEMORATIVE_GENERATE: "commemorative:generate",
  COMMEMORATIVE_MINT: "commemorative:mint",
  COMMEMORATIVE_UPLOAD: "commemorative:upload",

  // Notification jobs
  WEBHOOK_DELIVER: "webhook:deliver",
  NOTIFICATION_SEND: "notification:send",

  // Campaign jobs
  CAMPAIGN_RESOLVE: "campaign:resolve",
  CAMPAIGN_INDEX: "campaign:index",
  CAMPAIGN_TRENDING: "campaign:trending",

  // Dispute jobs
  DISPUTE_VOTING_CLOSE: "dispute:voting:close",
  DISPUTE_ESCALATE: "dispute:escalate",

  // Maintenance jobs
  CLEANUP_EXPIRED: "maintenance:cleanup",
  CACHE_WARM: "maintenance:cache:warm",
  METRICS_COLLECT: "maintenance:metrics",
};

// Export singleton instance
export const jobQueue = new JobQueue({
  maxConcurrent: 10,
  pollIntervalMs: 500,
  defaultMaxAttempts: 3,
  retryDelayMs: 5000,
});
