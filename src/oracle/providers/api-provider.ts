import { BaseOracleProvider } from "../base-provider";
import { OracleConfig, OracleResponse } from "../types";

/**
 * API Oracle Provider
 * Makes HTTP requests to external APIs for data verification
 */
export class ApiOracleProvider extends BaseOracleProvider {
  private cache: Map<string, { data: OracleResponse; expiry: number }> =
    new Map();
  private cacheTimeout = 60000; // 1 minute default cache

  constructor(config: OracleConfig) {
    super(config);

    if (config.type !== "api") {
      throw new Error("ApiOracleProvider requires api type config");
    }

    if (!config.endpoint) {
      throw new Error("ApiOracleProvider requires endpoint");
    }
  }

  async query(params: Record<string, any>): Promise<OracleResponse> {
    const cacheKey = this.getCacheKey(params);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return { ...cached.data, cached: true };
    }

    const mappedParams = this.mapQueryParams(params);
    const timeout = this.config.timeout || 10000;
    const retries = this.config.retries || 3;
    const retryDelay = this.config.retryDelay || 1000;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.makeRequest(mappedParams, timeout);
        const mappedData = this.mapResponse(response);

        const result: OracleResponse = {
          success: true,
          data: mappedData,
          rawData: response,
          timestamp: Date.now(),
          source: this.config.name,
          cached: false,
        };

        // Cache the result
        this.cache.set(cacheKey, {
          data: result,
          expiry: Date.now() + this.cacheTimeout,
        });

        return result;
      } catch (error) {
        lastError = error as Error;
        console.error(
          `Oracle ${this.config.id} query attempt ${attempt + 1} failed:`,
          error
        );

        if (attempt < retries) {
          await this.sleep(retryDelay * Math.pow(2, attempt)); // Exponential backoff
        }
      }
    }

    return {
      success: false,
      data: null,
      timestamp: Date.now(),
      source: this.config.name,
      cached: false,
      error: lastError?.message || "Unknown error",
    };
  }

  private async makeRequest(
    params: Record<string, any>,
    timeout: number
  ): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const url = this.buildUrl(params);
      const headers = this.buildHeaders();

      const options: RequestInit = {
        method: this.config.method || "GET",
        headers,
        signal: controller.signal,
      };

      if (this.config.method === "POST") {
        options.body = JSON.stringify(params);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildUrl(params: Record<string, any>): string {
    const url = new URL(this.config.endpoint!);

    if (this.config.method === "GET") {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...this.config.headers,
    };

    // Add authentication headers
    switch (this.config.authType) {
      case "api_key":
        // API key should be in config.headers
        break;
      case "bearer":
        // Bearer token should be in config.headers
        break;
      case "oauth":
        // OAuth handled separately
        break;
    }

    return headers;
  }

  private getCacheKey(params: Record<string, any>): string {
    return `${this.config.id}:${JSON.stringify(params)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(this.config.endpoint!, {
        method: "HEAD",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok || response.status === 405; // 405 = Method Not Allowed is OK for HEAD
    } catch {
      return false;
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Set cache timeout
   */
  setCacheTimeout(ms: number): void {
    this.cacheTimeout = ms;
  }
}
