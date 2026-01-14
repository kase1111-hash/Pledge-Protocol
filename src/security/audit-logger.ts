/**
 * Audit Logger Service
 * Phase 7: Production Infrastructure - Structured logging with audit trail
 */

import { AuditLogEntry } from "./types";
import { randomBytes } from "crypto";

/**
 * Log level hierarchy
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

/**
 * Structured log entry
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  context?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  duration?: number;
  metadata?: Record<string, any>;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  serviceName: string;
  environment: string;
  structured: boolean;
  includeTimestamp: boolean;
  includeStackTrace: boolean;
  redactFields: string[];
  outputHandler?: (entry: LogEntry) => void;
}

/**
 * Default redacted fields
 */
const DEFAULT_REDACTED_FIELDS = [
  "password",
  "secret",
  "key",
  "token",
  "authorization",
  "cookie",
  "signature",
  "privateKey",
  "mnemonic",
  "seed",
];

/**
 * Structured Logger
 * Provides structured logging with context propagation
 */
export class Logger {
  private config: LoggerConfig;
  private context: Record<string, any> = {};

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      level: config?.level || "info",
      serviceName: config?.serviceName || "pledge-protocol",
      environment: config?.environment || process.env.NODE_ENV || "development",
      structured: config?.structured ?? true,
      includeTimestamp: config?.includeTimestamp ?? true,
      includeStackTrace: config?.includeStackTrace ?? true,
      redactFields: [...DEFAULT_REDACTED_FIELDS, ...(config?.redactFields || [])],
      outputHandler: config?.outputHandler,
    };
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, any>): Logger {
    const child = new Logger(this.config);
    child.context = { ...this.context, ...context };
    return child;
  }

  /**
   * Set context for this logger instance
   */
  setContext(context: Record<string, any>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Log at debug level
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log("debug", message, context);
  }

  /**
   * Log at info level
   */
  info(message: string, context?: Record<string, any>): void {
    this.log("info", message, context);
  }

  /**
   * Log at warn level
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log("warn", message, context);
  }

  /**
   * Log at error level
   */
  error(message: string, error?: Error | Record<string, any>, context?: Record<string, any>): void {
    let errorInfo: LogEntry["error"] | undefined;

    if (error instanceof Error) {
      errorInfo = {
        name: error.name,
        message: error.message,
        stack: this.config.includeStackTrace ? error.stack : undefined,
      };
    }

    this.log("error", message, { ...context, ...(error instanceof Error ? {} : error) }, errorInfo);
  }

  /**
   * Log at fatal level
   */
  fatal(message: string, error?: Error | Record<string, any>, context?: Record<string, any>): void {
    let errorInfo: LogEntry["error"] | undefined;

    if (error instanceof Error) {
      errorInfo = {
        name: error.name,
        message: error.message,
        stack: this.config.includeStackTrace ? error.stack : undefined,
      };
    }

    this.log("fatal", message, { ...context, ...(error instanceof Error ? {} : error) }, errorInfo);
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    error?: LogEntry["error"]
  ): void {
    // Check if level should be logged
    if (LOG_LEVEL_VALUES[level] < LOG_LEVEL_VALUES[this.config.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.redactSensitiveData({ ...this.context, ...context }),
      error,
      metadata: {
        service: this.config.serviceName,
        environment: this.config.environment,
      },
    };

    if (this.config.outputHandler) {
      this.config.outputHandler(entry);
    } else {
      this.defaultOutput(entry);
    }
  }

  /**
   * Default output handler
   */
  private defaultOutput(entry: LogEntry): void {
    if (this.config.structured) {
      console.log(JSON.stringify(entry));
    } else {
      const timestamp = this.config.includeTimestamp ? `[${entry.timestamp}] ` : "";
      const level = entry.level.toUpperCase().padEnd(5);
      const context = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
      const error = entry.error ? ` Error: ${entry.error.message}` : "";

      console.log(`${timestamp}${level} ${entry.message}${context}${error}`);

      if (entry.error?.stack && this.config.includeStackTrace) {
        console.log(entry.error.stack);
      }
    }
  }

  /**
   * Redact sensitive data from context
   */
  private redactSensitiveData(data: Record<string, any>): Record<string, any> {
    if (!data) return data;

    const redacted: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();

      if (this.config.redactFields.some((field) => lowerKey.includes(field.toLowerCase()))) {
        redacted[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        redacted[key] = this.redactSensitiveData(value);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }
}

/**
 * Audit Logger
 * Specialized logger for compliance and security audit trails
 */
export class AuditLogger {
  private entries: AuditLogEntry[] = [];
  private logger: Logger;
  private retentionDays: number;
  private maxEntries: number;

  constructor(options?: { retentionDays?: number; maxEntries?: number; logger?: Logger }) {
    this.retentionDays = options?.retentionDays || 90;
    this.maxEntries = options?.maxEntries || 100000;
    this.logger = options?.logger || new Logger({ serviceName: "audit" });
  }

  /**
   * Log an audit event
   */
  log(
    action: string,
    actor: AuditLogEntry["actor"],
    resource: AuditLogEntry["resource"],
    details: Record<string, any>,
    result: AuditLogEntry["result"],
    options?: {
      error?: string;
      metadata?: AuditLogEntry["metadata"];
    }
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: `audit-${Date.now()}-${randomBytes(4).toString("hex")}`,
      timestamp: Date.now(),
      action,
      actor,
      resource,
      details,
      result,
      error: options?.error,
      metadata: options?.metadata || {},
    };

    this.entries.push(entry);

    // Enforce max entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Also log to structured logger
    this.logger.info(`Audit: ${action}`, {
      auditId: entry.id,
      actor: entry.actor,
      resource: entry.resource,
      result: entry.result,
    });

    return entry;
  }

  /**
   * Log a successful action
   */
  success(
    action: string,
    actor: AuditLogEntry["actor"],
    resource: AuditLogEntry["resource"],
    details: Record<string, any>,
    metadata?: AuditLogEntry["metadata"]
  ): AuditLogEntry {
    return this.log(action, actor, resource, details, "success", { metadata });
  }

  /**
   * Log a failed action
   */
  failure(
    action: string,
    actor: AuditLogEntry["actor"],
    resource: AuditLogEntry["resource"],
    details: Record<string, any>,
    reason: string,
    metadata?: AuditLogEntry["metadata"]
  ): AuditLogEntry {
    return this.log(action, actor, resource, details, "failure", { error: reason, metadata });
  }

  /**
   * Log an error
   */
  error(
    action: string,
    actor: AuditLogEntry["actor"],
    resource: AuditLogEntry["resource"],
    error: Error | string,
    metadata?: AuditLogEntry["metadata"]
  ): AuditLogEntry {
    const errorMessage = error instanceof Error ? error.message : error;
    return this.log(action, actor, resource, {}, "error", { error: errorMessage, metadata });
  }

  /**
   * Query audit logs
   */
  query(options?: {
    action?: string;
    actorAddress?: string;
    actorType?: AuditLogEntry["actor"]["type"];
    resourceType?: string;
    resourceId?: string;
    result?: AuditLogEntry["result"];
    since?: number;
    until?: number;
    limit?: number;
    offset?: number;
  }): { entries: AuditLogEntry[]; total: number } {
    let filtered = this.entries;

    if (options?.action) {
      filtered = filtered.filter((e) => e.action === options.action);
    }

    if (options?.actorAddress) {
      filtered = filtered.filter((e) => e.actor.address === options.actorAddress);
    }

    if (options?.actorType) {
      filtered = filtered.filter((e) => e.actor.type === options.actorType);
    }

    if (options?.resourceType) {
      filtered = filtered.filter((e) => e.resource.type === options.resourceType);
    }

    if (options?.resourceId) {
      filtered = filtered.filter((e) => e.resource.id === options.resourceId);
    }

    if (options?.result) {
      filtered = filtered.filter((e) => e.result === options.result);
    }

    if (options?.since) {
      filtered = filtered.filter((e) => e.timestamp >= options.since!);
    }

    if (options?.until) {
      filtered = filtered.filter((e) => e.timestamp <= options.until!);
    }

    const total = filtered.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 100;

    // Sort by timestamp descending (most recent first)
    filtered = filtered.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    filtered = filtered.slice(offset, offset + limit);

    return { entries: filtered, total };
  }

  /**
   * Get audit entry by ID
   */
  getEntry(id: string): AuditLogEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  /**
   * Get audit trail for a resource
   */
  getResourceTrail(resourceType: string, resourceId: string): AuditLogEntry[] {
    return this.entries
      .filter((e) => e.resource.type === resourceType && e.resource.id === resourceId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get audit trail for a user
   */
  getUserTrail(address: string, limit: number = 100): AuditLogEntry[] {
    return this.entries
      .filter((e) => e.actor.address === address)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Clean up old entries based on retention policy
   */
  cleanup(): number {
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    const before = this.entries.length;

    this.entries = this.entries.filter((e) => e.timestamp >= cutoff);

    const removed = before - this.entries.length;

    if (removed > 0) {
      this.logger.info(`Cleaned up ${removed} audit entries older than ${this.retentionDays} days`);
    }

    return removed;
  }

  /**
   * Export entries for compliance
   */
  export(options?: {
    since?: number;
    until?: number;
    format?: "json" | "csv";
  }): string {
    let entries = this.entries;

    if (options?.since) {
      entries = entries.filter((e) => e.timestamp >= options.since!);
    }

    if (options?.until) {
      entries = entries.filter((e) => e.timestamp <= options.until!);
    }

    if (options?.format === "csv") {
      const headers = [
        "id",
        "timestamp",
        "action",
        "actor_type",
        "actor_address",
        "resource_type",
        "resource_id",
        "result",
        "error",
      ];

      const rows = entries.map((e) => [
        e.id,
        new Date(e.timestamp).toISOString(),
        e.action,
        e.actor.type,
        e.actor.address || "",
        e.resource.type,
        e.resource.id,
        e.result,
        e.error || "",
      ]);

      return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    }

    return JSON.stringify(entries, null, 2);
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalEntries: number;
    entriesByResult: Record<string, number>;
    entriesByAction: Record<string, number>;
    entriesByResourceType: Record<string, number>;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    const entriesByResult: Record<string, number> = {};
    const entriesByAction: Record<string, number> = {};
    const entriesByResourceType: Record<string, number> = {};

    for (const entry of this.entries) {
      entriesByResult[entry.result] = (entriesByResult[entry.result] || 0) + 1;
      entriesByAction[entry.action] = (entriesByAction[entry.action] || 0) + 1;
      entriesByResourceType[entry.resource.type] =
        (entriesByResourceType[entry.resource.type] || 0) + 1;
    }

    const timestamps = this.entries.map((e) => e.timestamp);

    return {
      totalEntries: this.entries.length,
      entriesByResult,
      entriesByAction,
      entriesByResourceType,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : null,
    };
  }
}

// Export singleton instances
export const logger = new Logger();
export const auditLogger = new AuditLogger({ logger });
