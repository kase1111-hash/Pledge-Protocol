import { ApiOracleProvider } from "./api-provider";
import { OracleConfig, OracleResponse, RaceResult } from "../types";

/**
 * Race Timing Oracle Provider
 * Integrates with race timing APIs to verify marathon/race results
 */
export class RaceTimingProvider extends ApiOracleProvider {
  // Common race timing API endpoints
  private static readonly KNOWN_PROVIDERS: Record<string, Partial<OracleConfig>> = {
    "athlinks": {
      endpoint: "https://api.athlinks.com/v1/results",
      queryMapping: {
        eventId: "EventId",
        bibNumber: "BibNumber",
      },
      responseMapping: {
        status: "Status",
        timeSeconds: "ChipTime",
        distanceMiles: "Distance",
        placementOverall: "OverallPlace",
        placementDivision: "DivisionPlace",
        runnerName: "FullName",
      },
    },
    "runsignup": {
      endpoint: "https://runsignup.com/Rest/race/results",
      queryMapping: {
        eventId: "race_id",
        bibNumber: "bib_num",
      },
      responseMapping: {
        status: "result_status",
        timeSeconds: "chip_time_seconds",
        distanceMiles: "distance_miles",
        placementOverall: "overall_place",
      },
    },
    "chronotrack": {
      endpoint: "https://api.chronotrack.com/results",
      queryMapping: {
        eventId: "event",
        bibNumber: "bib",
      },
      responseMapping: {
        status: "finish_status",
        timeSeconds: "gun_time_secs",
        distanceMiles: "race_distance",
        placementOverall: "place",
      },
    },
  };

  constructor(config: OracleConfig, providerType?: string) {
    // Merge with known provider config if specified
    if (providerType && RaceTimingProvider.KNOWN_PROVIDERS[providerType]) {
      config = {
        ...config,
        ...RaceTimingProvider.KNOWN_PROVIDERS[providerType],
      };
    }

    super(config);
  }

  /**
   * Query race results for a specific runner
   */
  async queryRaceResult(
    eventId: string,
    bibNumber: string
  ): Promise<OracleResponse> {
    return this.query({ eventId, bibNumber });
  }

  /**
   * Parse the response into a standardized RaceResult
   */
  parseRaceResult(response: OracleResponse): RaceResult | null {
    if (!response.success || !response.data) {
      return null;
    }

    const data = response.data;

    return {
      status: this.normalizeStatus(data.status),
      timeSeconds: data.timeSeconds,
      distanceMiles: data.distanceMiles,
      pacePerMile: this.calculatePace(data.timeSeconds, data.distanceMiles),
      placementOverall: data.placementOverall,
      placementDivision: data.placementDivision,
      bibNumber: data.bibNumber || "",
      runnerName: data.runnerName,
    };
  }

  /**
   * Normalize status values from different providers
   */
  private normalizeStatus(
    status: string | undefined
  ): "finished" | "dnf" | "dns" | "pending" {
    if (!status) return "pending";

    const normalized = status.toLowerCase();

    if (
      normalized === "finished" ||
      normalized === "complete" ||
      normalized === "fin"
    ) {
      return "finished";
    }

    if (
      normalized === "dnf" ||
      normalized === "did not finish" ||
      normalized === "incomplete"
    ) {
      return "dnf";
    }

    if (
      normalized === "dns" ||
      normalized === "did not start" ||
      normalized === "no show"
    ) {
      return "dns";
    }

    return "pending";
  }

  /**
   * Calculate pace per mile
   */
  private calculatePace(
    timeSeconds?: number,
    distanceMiles?: number
  ): number | undefined {
    if (!timeSeconds || !distanceMiles || distanceMiles === 0) {
      return undefined;
    }
    return timeSeconds / distanceMiles;
  }

  /**
   * Check if runner completed the race
   */
  isCompleted(result: RaceResult): boolean {
    return result.status === "finished";
  }

  /**
   * Check if runner finished under a target time
   */
  isUnderTime(result: RaceResult, targetSeconds: number): boolean {
    return (
      result.status === "finished" &&
      result.timeSeconds !== undefined &&
      result.timeSeconds <= targetSeconds
    );
  }

  /**
   * Get miles completed (for per-mile pledges)
   */
  getMilesCompleted(result: RaceResult): number {
    if (result.status === "finished" && result.distanceMiles) {
      return result.distanceMiles;
    }

    // For DNF, we might have partial distance
    // This would require more detailed API support
    return 0;
  }

  /**
   * Format time for display
   */
  static formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }

    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }

  /**
   * Create a pre-configured provider for a known race timing service
   */
  static createForProvider(
    providerType: keyof typeof RaceTimingProvider.KNOWN_PROVIDERS,
    apiKey?: string
  ): RaceTimingProvider {
    const baseConfig = RaceTimingProvider.KNOWN_PROVIDERS[providerType];

    if (!baseConfig) {
      throw new Error(`Unknown race timing provider: ${providerType}`);
    }

    const config: OracleConfig = {
      id: `race-timing-${providerType}`,
      name: `${providerType.charAt(0).toUpperCase() + providerType.slice(1)} Race Timing`,
      description: `Official race timing integration via ${providerType}`,
      type: "api",
      trustLevel: "official",
      active: true,
      timeout: 15000,
      retries: 3,
      ...baseConfig,
      headers: apiKey
        ? { Authorization: `Bearer ${apiKey}`, ...baseConfig.headers }
        : baseConfig.headers,
    };

    return new RaceTimingProvider(config, providerType);
  }
}
