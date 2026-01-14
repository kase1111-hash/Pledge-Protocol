import {
  OracleConfig,
  OracleQuery,
  OracleResponse,
  MilestoneCondition,
  VerificationResult,
} from "./types";

/**
 * Base Oracle Provider Interface
 * All oracle implementations must implement this interface
 */
export interface IOracleProvider {
  readonly config: OracleConfig;

  /**
   * Query the oracle for data
   */
  query(params: Record<string, any>): Promise<OracleResponse>;

  /**
   * Verify a milestone condition against oracle data
   */
  verifyCondition(data: any, condition: MilestoneCondition): boolean;

  /**
   * Check if the oracle is healthy/reachable
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Abstract base class for oracle providers
 */
export abstract class BaseOracleProvider implements IOracleProvider {
  constructor(public readonly config: OracleConfig) {}

  abstract query(params: Record<string, any>): Promise<OracleResponse>;

  /**
   * Default condition verification logic
   */
  verifyCondition(data: any, condition: MilestoneCondition): boolean {
    const fieldValue = this.extractField(data, condition.field);

    switch (condition.operator) {
      case "exists":
        return fieldValue !== undefined && fieldValue !== null;

      case "eq":
        return fieldValue === condition.value;

      case "gt":
        return typeof fieldValue === "number" && fieldValue > condition.value;

      case "gte":
        return typeof fieldValue === "number" && fieldValue >= condition.value;

      case "lt":
        return typeof fieldValue === "number" && fieldValue < condition.value;

      case "lte":
        return typeof fieldValue === "number" && fieldValue <= condition.value;

      case "between":
        return (
          typeof fieldValue === "number" &&
          fieldValue >= condition.value &&
          fieldValue <= condition.valueEnd
        );

      default:
        return false;
    }
  }

  /**
   * Extract a field value using dot notation
   */
  protected extractField(data: any, fieldPath: string): any {
    const parts = fieldPath.split(".");
    let value = data;

    for (const part of parts) {
      if (value === undefined || value === null) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * Map API response to internal schema
   */
  protected mapResponse(rawData: any): any {
    if (!this.config.responseMapping) {
      return rawData;
    }

    const mapped: Record<string, any> = {};

    for (const [internalKey, externalPath] of Object.entries(
      this.config.responseMapping
    )) {
      mapped[internalKey] = this.extractField(rawData, externalPath);
    }

    return mapped;
  }

  /**
   * Map internal params to API params
   */
  protected mapQueryParams(params: Record<string, any>): Record<string, any> {
    if (!this.config.queryMapping) {
      return params;
    }

    const mapped: Record<string, any> = {};

    for (const [internalKey, externalKey] of Object.entries(
      this.config.queryMapping
    )) {
      if (params[internalKey] !== undefined) {
        mapped[externalKey] = params[internalKey];
      }
    }

    return mapped;
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Default implementation - try a simple query
      const response = await this.query({});
      return response.success;
    } catch {
      return false;
    }
  }
}
