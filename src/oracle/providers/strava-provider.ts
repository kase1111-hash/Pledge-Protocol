import { ApiOracleProvider } from "./api-provider";
import { OracleConfig, OracleResponse } from "../types";

/**
 * Strava Activity Result Interface
 */
export interface StravaActivityResult {
  activityId: string;
  activityType: "run" | "ride" | "swim" | "hike" | "walk" | "workout" | "other";
  distanceMeters: number;
  distanceMiles: number;
  elapsedTimeSeconds: number;
  movingTimeSeconds: number;
  totalElevationGainMeters: number;
  averageSpeedMps: number;
  maxSpeedMps: number;
  averageHeartrate?: number;
  maxHeartrate?: number;
  startDate: string;
  athleteId: number;
  name: string;
  kudosCount: number;
  achievementCount: number;
}

/**
 * Strava OAuth Token Interface
 */
interface StravaToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Strava Oracle Provider
 * Integrates with Strava API for fitness activity verification
 * Supports runs, bike rides, swims, hikes, and other fitness activities
 */
export class StravaProvider extends ApiOracleProvider {
  private static readonly STRAVA_API_BASE = "https://www.strava.com/api/v3";
  private static readonly STRAVA_OAUTH_URL = "https://www.strava.com/oauth/token";

  private token: StravaToken | null = null;
  private clientId: string;
  private clientSecret: string;

  constructor(config: OracleConfig, clientId: string, clientSecret: string) {
    const stravaConfig: OracleConfig = {
      ...config,
      endpoint: `${StravaProvider.STRAVA_API_BASE}/activities`,
      type: "api",
      authType: "oauth",
      responseMapping: {
        activityId: "id",
        activityType: "type",
        distanceMeters: "distance",
        elapsedTimeSeconds: "elapsed_time",
        movingTimeSeconds: "moving_time",
        totalElevationGainMeters: "total_elevation_gain",
        averageSpeedMps: "average_speed",
        maxSpeedMps: "max_speed",
        averageHeartrate: "average_heartrate",
        maxHeartrate: "max_heartrate",
        startDate: "start_date",
        athleteId: "athlete.id",
        name: "name",
        kudosCount: "kudos_count",
        achievementCount: "achievement_count",
      },
    };

    super(stravaConfig);
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * Set OAuth tokens for API access
   */
  setTokens(accessToken: string, refreshToken: string, expiresAt: number): void {
    this.token = { accessToken, refreshToken, expiresAt };
  }

  /**
   * Refresh OAuth token if expired
   */
  private async ensureValidToken(): Promise<string> {
    if (!this.token) {
      throw new Error("Strava OAuth tokens not configured");
    }

    // Check if token is expired (with 5 min buffer)
    if (this.token.expiresAt < Date.now() / 1000 + 300) {
      await this.refreshAccessToken();
    }

    return this.token.accessToken;
  }

  /**
   * Refresh the access token using refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.token) {
      throw new Error("No refresh token available");
    }

    const response = await fetch(StravaProvider.STRAVA_OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: "refresh_token",
        refresh_token: this.token.refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh Strava token: ${response.statusText}`);
    }

    const data = await response.json();
    this.token = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
    };
  }

  /**
   * Query a specific activity by ID
   */
  async queryActivity(activityId: string): Promise<OracleResponse> {
    const accessToken = await this.ensureValidToken();

    try {
      const response = await fetch(
        `${StravaProvider.STRAVA_API_BASE}/activities/${activityId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        return {
          success: false,
          data: null,
          timestamp: Date.now(),
          source: this.config.name,
          cached: false,
          error: `Strava API error: ${response.status}`,
        };
      }

      const rawData = await response.json();
      const mappedData = this.mapResponse(rawData);

      // Add calculated fields
      mappedData.distanceMiles = mappedData.distanceMeters / 1609.34;

      return {
        success: true,
        data: mappedData,
        rawData,
        timestamp: Date.now(),
        source: this.config.name,
        cached: false,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        timestamp: Date.now(),
        source: this.config.name,
        cached: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Query athlete's activities within a date range
   */
  async queryActivities(
    after?: number,
    before?: number,
    page = 1,
    perPage = 30
  ): Promise<OracleResponse> {
    const accessToken = await this.ensureValidToken();

    const params = new URLSearchParams();
    if (after) params.set("after", String(after));
    if (before) params.set("before", String(before));
    params.set("page", String(page));
    params.set("per_page", String(perPage));

    try {
      const response = await fetch(
        `${StravaProvider.STRAVA_API_BASE}/athlete/activities?${params}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        return {
          success: false,
          data: null,
          timestamp: Date.now(),
          source: this.config.name,
          cached: false,
          error: `Strava API error: ${response.status}`,
        };
      }

      const rawData = await response.json();
      const mappedActivities = rawData.map((activity: any) => {
        const mapped = this.mapResponse(activity);
        mapped.distanceMiles = mapped.distanceMeters / 1609.34;
        return mapped;
      });

      return {
        success: true,
        data: mappedActivities,
        rawData,
        timestamp: Date.now(),
        source: this.config.name,
        cached: false,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        timestamp: Date.now(),
        source: this.config.name,
        cached: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Parse response into StravaActivityResult
   */
  parseActivityResult(response: OracleResponse): StravaActivityResult | null {
    if (!response.success || !response.data) {
      return null;
    }

    const data = response.data;
    return {
      activityId: String(data.activityId),
      activityType: this.normalizeActivityType(data.activityType),
      distanceMeters: data.distanceMeters || 0,
      distanceMiles: data.distanceMiles || 0,
      elapsedTimeSeconds: data.elapsedTimeSeconds || 0,
      movingTimeSeconds: data.movingTimeSeconds || 0,
      totalElevationGainMeters: data.totalElevationGainMeters || 0,
      averageSpeedMps: data.averageSpeedMps || 0,
      maxSpeedMps: data.maxSpeedMps || 0,
      averageHeartrate: data.averageHeartrate,
      maxHeartrate: data.maxHeartrate,
      startDate: data.startDate,
      athleteId: data.athleteId,
      name: data.name,
      kudosCount: data.kudosCount || 0,
      achievementCount: data.achievementCount || 0,
    };
  }

  /**
   * Normalize activity type from Strava
   */
  private normalizeActivityType(
    type: string
  ): "run" | "ride" | "swim" | "hike" | "walk" | "workout" | "other" {
    const normalized = type?.toLowerCase();

    if (normalized === "run" || normalized === "virtualrun") return "run";
    if (normalized === "ride" || normalized === "virtualride") return "ride";
    if (normalized === "swim") return "swim";
    if (normalized === "hike") return "hike";
    if (normalized === "walk") return "walk";
    if (normalized === "workout" || normalized === "weighttraining") return "workout";

    return "other";
  }

  /**
   * Calculate pace per mile for running activities
   */
  calculatePacePerMile(result: StravaActivityResult): number | null {
    if (result.distanceMiles === 0) return null;
    return result.movingTimeSeconds / result.distanceMiles;
  }

  /**
   * Format pace as mm:ss per mile
   */
  static formatPace(paceSeconds: number): string {
    const minutes = Math.floor(paceSeconds / 60);
    const seconds = Math.floor(paceSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  /**
   * Format distance for display
   */
  static formatDistance(meters: number, unit: "miles" | "km" = "miles"): string {
    if (unit === "miles") {
      return `${(meters / 1609.34).toFixed(2)} mi`;
    }
    return `${(meters / 1000).toFixed(2)} km`;
  }

  /**
   * Format duration for display
   */
  static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }

  /**
   * Create a pre-configured Strava provider
   */
  static create(clientId: string, clientSecret: string): StravaProvider {
    const config: OracleConfig = {
      id: "strava-fitness",
      name: "Strava Fitness",
      description: "Fitness activity verification via Strava",
      type: "api",
      trustLevel: "verified",
      active: true,
      timeout: 15000,
      retries: 3,
    };

    return new StravaProvider(config, clientId, clientSecret);
  }

  /**
   * Health check for Strava API
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.token) return false;
      await this.ensureValidToken();
      return true;
    } catch {
      return false;
    }
  }
}
