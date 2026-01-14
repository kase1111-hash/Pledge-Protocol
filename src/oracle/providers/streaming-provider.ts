import { ApiOracleProvider } from "./api-provider";
import { OracleConfig, OracleResponse } from "../types";

/**
 * Streaming Platform Types
 */
export type StreamingPlatform = "spotify" | "youtube" | "twitch" | "soundcloud";

/**
 * Album/Track Release Result
 */
export interface ReleaseResult {
  releaseId: string;
  title: string;
  artistName: string;
  releaseType: "album" | "single" | "ep" | "compilation";
  releaseDate: string;
  trackCount: number;
  isReleased: boolean;
  platform: StreamingPlatform;
  externalUrl: string;
  totalStreams?: number;
  popularity?: number;
}

/**
 * Video/Content Result
 */
export interface ContentResult {
  contentId: string;
  title: string;
  channelName: string;
  contentType: "video" | "live" | "short" | "podcast";
  publishedAt: string;
  isPublished: boolean;
  platform: StreamingPlatform;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: number;
  externalUrl: string;
}

/**
 * Channel/Artist Milestone Result
 */
export interface ChannelMilestoneResult {
  channelId: string;
  channelName: string;
  platform: StreamingPlatform;
  subscriberCount: number;
  followerCount: number;
  totalViews: number;
  totalStreams: number;
  videoCount: number;
  verifiedDate: string;
}

/**
 * OAuth Token Interface
 */
interface OAuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Streaming Platform Oracle Provider
 * Integrates with Spotify, YouTube, Twitch for creative project verification
 */
export class StreamingProvider extends ApiOracleProvider {
  private static readonly PLATFORM_CONFIGS: Record<StreamingPlatform, Partial<OracleConfig>> = {
    spotify: {
      endpoint: "https://api.spotify.com/v1",
      responseMapping: {
        releaseId: "id",
        title: "name",
        artistName: "artists[0].name",
        releaseDate: "release_date",
        trackCount: "total_tracks",
        popularity: "popularity",
        externalUrl: "external_urls.spotify",
      },
    },
    youtube: {
      endpoint: "https://www.googleapis.com/youtube/v3",
      responseMapping: {
        contentId: "items[0].id",
        title: "items[0].snippet.title",
        channelName: "items[0].snippet.channelTitle",
        publishedAt: "items[0].snippet.publishedAt",
        viewCount: "items[0].statistics.viewCount",
        likeCount: "items[0].statistics.likeCount",
        commentCount: "items[0].statistics.commentCount",
        duration: "items[0].contentDetails.duration",
      },
    },
    twitch: {
      endpoint: "https://api.twitch.tv/helix",
      responseMapping: {
        channelId: "data[0].id",
        channelName: "data[0].display_name",
        followerCount: "data[0].followers",
        viewCount: "data[0].view_count",
      },
    },
    soundcloud: {
      endpoint: "https://api.soundcloud.com",
      responseMapping: {
        releaseId: "id",
        title: "title",
        artistName: "user.username",
        releaseDate: "created_at",
        totalStreams: "playback_count",
      },
    },
  };

  private platform: StreamingPlatform;
  private token: OAuthToken | null = null;
  private apiKey?: string;

  constructor(config: OracleConfig, platform: StreamingPlatform, apiKey?: string) {
    const platformConfig = StreamingProvider.PLATFORM_CONFIGS[platform];

    const mergedConfig: OracleConfig = {
      ...config,
      ...platformConfig,
      type: "api",
      authType: platform === "youtube" ? "api_key" : "oauth",
    };

    super(mergedConfig);
    this.platform = platform;
    this.apiKey = apiKey;
  }

  /**
   * Set OAuth tokens
   */
  setTokens(accessToken: string, refreshToken: string, expiresAt: number): void {
    this.token = { accessToken, refreshToken, expiresAt };
  }

  /**
   * Verify album/track release on Spotify
   */
  async verifySpotifyRelease(albumId: string): Promise<OracleResponse> {
    if (this.platform !== "spotify") {
      throw new Error("Use Spotify provider for album verification");
    }

    return this.queryWithAuth(`/albums/${albumId}`);
  }

  /**
   * Verify video publication on YouTube
   */
  async verifyYouTubeVideo(videoId: string): Promise<OracleResponse> {
    if (this.platform !== "youtube") {
      throw new Error("Use YouTube provider for video verification");
    }

    const params = new URLSearchParams({
      part: "snippet,statistics,contentDetails",
      id: videoId,
      key: this.apiKey || "",
    });

    return this.queryWithAuth(`/videos?${params}`);
  }

  /**
   * Get YouTube channel statistics
   */
  async getYouTubeChannelStats(channelId: string): Promise<OracleResponse> {
    if (this.platform !== "youtube") {
      throw new Error("Use YouTube provider for channel stats");
    }

    const params = new URLSearchParams({
      part: "statistics,snippet",
      id: channelId,
      key: this.apiKey || "",
    });

    return this.queryWithAuth(`/channels?${params}`);
  }

  /**
   * Get Twitch channel info
   */
  async getTwitchChannelInfo(channelName: string): Promise<OracleResponse> {
    if (this.platform !== "twitch") {
      throw new Error("Use Twitch provider for channel info");
    }

    return this.queryWithAuth(`/users?login=${channelName}`);
  }

  /**
   * Get Twitch follower count
   */
  async getTwitchFollowerCount(broadcasterId: string): Promise<OracleResponse> {
    if (this.platform !== "twitch") {
      throw new Error("Use Twitch provider for follower count");
    }

    return this.queryWithAuth(`/channels/followers?broadcaster_id=${broadcasterId}&first=1`);
  }

  /**
   * Query with authentication
   */
  private async queryWithAuth(endpoint: string): Promise<OracleResponse> {
    try {
      const headers = await this.buildAuthHeaders();
      const baseUrl = StreamingProvider.PLATFORM_CONFIGS[this.platform].endpoint;

      const response = await fetch(`${baseUrl}${endpoint}`, {
        headers: {
          ...headers,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        return {
          success: false,
          data: null,
          timestamp: Date.now(),
          source: this.config.name,
          cached: false,
          error: `${this.platform} API error: ${response.status}`,
        };
      }

      const rawData = await response.json();
      const mappedData = this.mapResponse(rawData);

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
   * Build authentication headers based on platform
   */
  private async buildAuthHeaders(): Promise<Record<string, string>> {
    switch (this.platform) {
      case "youtube":
        return {}; // API key is in query params

      case "spotify":
        if (!this.token) throw new Error("Spotify OAuth tokens not configured");
        return { Authorization: `Bearer ${this.token.accessToken}` };

      case "twitch":
        if (!this.token || !this.apiKey) {
          throw new Error("Twitch OAuth tokens and Client-ID required");
        }
        return {
          Authorization: `Bearer ${this.token.accessToken}`,
          "Client-Id": this.apiKey,
        };

      case "soundcloud":
        if (!this.apiKey) throw new Error("SoundCloud API key required");
        return { Authorization: `OAuth ${this.apiKey}` };

      default:
        return {};
    }
  }

  /**
   * Parse release result
   */
  parseReleaseResult(response: OracleResponse): ReleaseResult | null {
    if (!response.success || !response.data) {
      return null;
    }

    const data = response.data;
    const rawData = response.rawData;

    // Determine release type from track count or album type
    let releaseType: ReleaseResult["releaseType"] = "album";
    if (rawData?.album_type === "single" || data.trackCount === 1) {
      releaseType = "single";
    } else if (rawData?.album_type === "compilation") {
      releaseType = "compilation";
    } else if (data.trackCount && data.trackCount <= 6) {
      releaseType = "ep";
    }

    return {
      releaseId: data.releaseId || "",
      title: data.title || "",
      artistName: data.artistName || "",
      releaseType,
      releaseDate: data.releaseDate || "",
      trackCount: data.trackCount || 0,
      isReleased: Boolean(data.releaseDate),
      platform: this.platform,
      externalUrl: data.externalUrl || "",
      totalStreams: data.totalStreams,
      popularity: data.popularity,
    };
  }

  /**
   * Parse content result (for YouTube/Twitch)
   */
  parseContentResult(response: OracleResponse): ContentResult | null {
    if (!response.success || !response.data) {
      return null;
    }

    const data = response.data;

    return {
      contentId: data.contentId || "",
      title: data.title || "",
      channelName: data.channelName || "",
      contentType: this.determineContentType(data),
      publishedAt: data.publishedAt || "",
      isPublished: Boolean(data.publishedAt),
      platform: this.platform,
      viewCount: parseInt(data.viewCount) || 0,
      likeCount: parseInt(data.likeCount) || 0,
      commentCount: parseInt(data.commentCount) || 0,
      duration: this.parseDuration(data.duration),
      externalUrl: this.buildContentUrl(data.contentId),
    };
  }

  /**
   * Parse channel milestone result
   */
  parseChannelMilestone(response: OracleResponse): ChannelMilestoneResult | null {
    if (!response.success || !response.data) {
      return null;
    }

    const data = response.data;
    const rawData = response.rawData;

    return {
      channelId: data.channelId || rawData?.items?.[0]?.id || "",
      channelName: data.channelName || rawData?.items?.[0]?.snippet?.title || "",
      platform: this.platform,
      subscriberCount: parseInt(rawData?.items?.[0]?.statistics?.subscriberCount) || 0,
      followerCount: data.followerCount || 0,
      totalViews: parseInt(rawData?.items?.[0]?.statistics?.viewCount) || 0,
      totalStreams: data.totalStreams || 0,
      videoCount: parseInt(rawData?.items?.[0]?.statistics?.videoCount) || 0,
      verifiedDate: new Date().toISOString(),
    };
  }

  /**
   * Determine content type
   */
  private determineContentType(data: any): ContentResult["contentType"] {
    if (data.duration && this.parseDuration(data.duration) < 60) {
      return "short";
    }
    return "video";
  }

  /**
   * Parse ISO 8601 duration to seconds
   */
  private parseDuration(duration: string | number | undefined): number {
    if (typeof duration === "number") return duration;
    if (!duration || typeof duration !== "string") return 0;

    // Parse ISO 8601 duration (PT1H2M3S)
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Build content URL
   */
  private buildContentUrl(contentId: string): string {
    switch (this.platform) {
      case "youtube":
        return `https://youtube.com/watch?v=${contentId}`;
      case "twitch":
        return `https://twitch.tv/videos/${contentId}`;
      case "spotify":
        return `https://open.spotify.com/album/${contentId}`;
      case "soundcloud":
        return `https://soundcloud.com/tracks/${contentId}`;
      default:
        return "";
    }
  }

  /**
   * Format view count for display
   */
  static formatViewCount(count: number): string {
    if (count >= 1000000000) {
      return `${(count / 1000000000).toFixed(1)}B`;
    }
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  }

  /**
   * Create a pre-configured provider for a platform
   */
  static createForPlatform(
    platform: StreamingPlatform,
    apiKey?: string
  ): StreamingProvider {
    const config: OracleConfig = {
      id: `streaming-${platform}`,
      name: `${platform.charAt(0).toUpperCase() + platform.slice(1)} Streaming`,
      description: `Content verification via ${platform}`,
      type: "api",
      trustLevel: "verified",
      active: true,
      timeout: 15000,
      retries: 3,
    };

    return new StreamingProvider(config, platform, apiKey);
  }
}
